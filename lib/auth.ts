import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { accounts, sessions, tenants, users } from './db/schema';

export { hashPin, verifyPin } from './pin';

const COOKIE = 'bz_session';
const REMEMBERED_COOKIE = 'bz_remembered_session';
const REMEMBER_ENABLED_COOKIE = 'bz_remember_login';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 дней — сотрудник не должен логиниться каждый день
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 180;

/* Режим «глазами работника» в сценарии первого запуска.

   Вторая cookie ПОВЕРХ владельческой, а не вместо неё: пока превью
   живо, каждый запрос работает от настоящей сессии работника — с его
   правами, его сменой и его именем в записях, — а сессия владельца
   лежит нетронутой в своей cookie. Выход из превью — удаление одной
   cookie; что бы ни случилось посреди, владелец не заперт снаружи
   собственного кабинета и не должен логиниться заново. */
const PREVIEW_COOKIE = 'bz_preview';
/* Часов, а не дней: превью — часть получасового сценария, а не рабочий
   вход. Запас на «закрыл ноутбук, вернулся вечером» — и всё. */
const PREVIEW_MAX_AGE = 60 * 60 * 12;
/** Подпись превью-сессии в списке устройств — и признак, по которому
 *  брошенные превью гасятся при следующем запуске. */
const PREVIEW_DEVICE = 'Tetrin onboarding';

/* Дефолтный ключ допустим только локально. На сервере без своего секрета
   сессии подписывались бы общеизвестной строкой — подделать cookie
   владельца смог бы кто угодно. Лучше не запуститься, чем работать так. */
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET не задан');
}

const secret = new TextEncoder().encode(
  process.env.SESSION_SECRET ?? 'dev-only-insecure-secret-please-change-me-now',
);

export type Role = 'owner' | 'staff';
export type Session = {
  uid: string;
  tid: string;
  role: Role;
  /**
   * Запрос работает от превью-сессии работника (см. PREVIEW_COOKIE).
   * Единственное, что от этого зависит, — плашка сценария на экране
   * смены и молчание приветствия работника: права и так рабочие, они
   * пришли вместе с ролью.
   */
  preview?: boolean;
};
/** То же плюс поля, по которым сессию можно отозвать. */
export type Claims = Session & { sid: string; ver: number };
export type RememberedWebAccount = {
  name: string;
  tenant: string;
  role: Role;
};

/* ---------------------------- токен ----------------------------- */

/**
 * Подписать токен доступа.
 *
 * `sid` — строка в таблице сессий, `ver` — поколение сессий пользователя.
 * Оба нужны, чтобы доступ выключался немедленно: без них токен живёт до
 * конца срока, и после кражи телефона сделать нельзя ничего.
 */
export async function signAccess(claims: Claims, expires = '30d'): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expires)
    .sign(secret);
}

/** Разобрать и проверить подпись. База при этом не трогается. */
export async function readToken(token: string): Promise<Claims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { uid, tid, role, sid, ver } = payload as Record<string, unknown>;
    if (typeof uid !== 'string' || typeof tid !== 'string') return null;
    if (role !== 'owner' && role !== 'staff') return null;
    return {
      uid,
      tid,
      role,
      sid: typeof sid === 'string' ? sid : '',
      ver: typeof ver === 'number' ? ver : 0,
    };
  } catch {
    return null;
  }
}

/* ---------------------------- сессия ----------------------------- */

export async function startSession(
  session: Session,
  opts: { kind?: 'web' | 'app'; device?: string | null } = {},
): Promise<string> {
  const [row] = await db
    .insert(sessions)
    .values({
      tenantId: session.tid,
      userId: session.uid,
      kind: opts.kind ?? 'web',
      device: opts.device ?? null,
    })
    .returning();

  /* Поколение берётся оттуда же, откуда его потом читает sessionAlive, —
     у человека. Возьми мы копию из users, любое расхождение между ними
     превращало бы вход в петлю: cookie выдаётся, первая же страница
     сверяет поколение по человеку, не сходится, и человека выбрасывает
     на /session-ended. Причём в приложении всё работало бы — оно давно
     берёт поколение у человека. */
  const [user] = await db
    .select({ ver: accounts.tokenVersion, legacyVer: users.tokenVersion })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, session.uid));

  const token = await signAccess({
    ...session,
    sid: row.id,
    ver: user?.ver ?? user?.legacyVer ?? 0,
  });

  const jar = await cookies();
  // Новый ручной вход всегда заменяет сохранённый профиль прошлого
  // человека на этом браузере.
  jar.delete(REMEMBERED_COOKIE);
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });

  return row.id;
}

export async function endSession({ remember = false }: { remember?: boolean } = {}): Promise<void> {
  const jar = await cookies();

  /* Выход закрывает и превью работника, если оно шло: оставить его
     живым значило бы, что «выйти» на общем компьютере оставляет рабочий
     вход в бизнес. */
  const preview = await previewClaims(jar);
  jar.delete(PREVIEW_COOKIE);
  if (preview?.sid) await revokeSession(preview.sid);

  const token = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);

  const claims = token ? await readToken(token) : null;
  if (remember && claims?.sid) {
    /* Активную cookie убираем, но оставляем отдельный HttpOnly-пропуск.
       Он не доступен JavaScript и всё равно сверяется с живой сессией и
       поколением PIN перед возвращением в кабинет. */
    const remembered = await signAccess(claims, '180d');
    jar.set(REMEMBERED_COOKIE, remembered, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: REMEMBER_MAX_AGE,
    });
    return;
  }

  jar.delete(REMEMBERED_COOKIE);
  // cookie удалена у себя, но токен мог быть скопирован — гасим и в базе
  if (claims?.sid) await revokeSession(claims.sid);
}

/**
 * Запоминать ли профиль после выхода. По умолчанию — НЕТ.
 *
 * Сохранённый профиль возвращает в кабинет одним нажатием на аватар,
 * без телефона и кода. Удобно ровно в одном случае: компьютер личный.
 * А в мойке он общий — тот же ноутбук в подсобке, за которым сидят
 * посменно, и «выйти» там означает выйти, а не оставить дверь
 * прикрытой.
 *
 * Поэтому включает это человек сам, осознанно, в своём профиле. Раньше
 * умолчание было обратным, и удобство доставалось всем, а риск — тем,
 * у кого компьютер общий: как раз тем, кто про эту настройку не знает.
 */
export async function rememberedLoginEnabled(): Promise<boolean> {
  const jar = await cookies();
  return jar.get(REMEMBER_ENABLED_COOKIE)?.value === '1';
}

export async function setRememberedLoginEnabled(enabled: boolean): Promise<void> {
  const jar = await cookies();
  jar.set(REMEMBER_ENABLED_COOKIE, enabled ? '1' : '0', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
  if (!enabled) jar.delete(REMEMBERED_COOKIE);
}

/** Безопасные данные для аватара на странице входа, без телефона и токена. */
export async function getRememberedAccount(): Promise<RememberedWebAccount | null> {
  const jar = await cookies();
  const token = jar.get(REMEMBERED_COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims || !(await sessionAlive(claims))) return null;

  const [row] = await db
    .select({ name: users.name, tenant: tenants.name })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(users.id, claims.uid), eq(users.tenantId, claims.tid)));

  return row ? { ...row, role: claims.role } : null;
}

/** Вернуть сохранённую сессию в активную cookie после нажатия аватара. */
export async function resumeRememberedSession(): Promise<Role | null> {
  const jar = await cookies();
  const token = jar.get(REMEMBERED_COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims || !(await sessionAlive(claims))) {
    jar.delete(REMEMBERED_COOKIE);
    return null;
  }

  const active = await signAccess(claims, '30d');
  jar.set(COOKIE, active, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
  return claims.role;
}

export async function revokeSession(sid: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)));
}

/**
 * Закрыть человеку доступ к ОДНОЙ точке.
 *
 * Гасит сессии этого участия и не трогает поколение: поколение живёт у
 * человека, а человек может работать и на другой мойке. Увольнение на
 * одной точке не имеет права выкидывать его из второй — там его никто
 * не увольнял.
 */
export async function revokeMembershipSessions(membershipId: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.userId, membershipId), isNull(sessions.revokedAt)));
}

/**
 * Выйти везде: погасить все сессии человека и сдвинуть его поколение.
 *
 * Это про человека целиком, поэтому берёт все его участия разом. Смена
 * PIN — единственное, что сюда попадает: код общий, значит и выход
 * общий.
 */
export async function revokeAccountSessions(accountId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const memberships = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.accountId, accountId));

    const ids = memberships.map((m) => m.id);
    if (ids.length > 0) {
      await tx
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(inArray(sessions.userId, ids), isNull(sessions.revokedAt)));
    }

    await tx
      .update(accounts)
      .set({ tokenVersion: sql`${accounts.tokenVersion} + 1` })
      .where(eq(accounts.id, accountId));

    /* Копия в users, пока она есть: схема обязана оставаться
       совместимой со старым кодом, чтобы откат делался откатом кода. */
    if (ids.length > 0) {
      await tx
        .update(users)
        .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
        .where(inArray(users.id, ids));
    }
  });
}

/* ------------------------ превью работника ------------------------ */

/**
 * Претензии превью-cookie, если она есть и подпись верна.
 *
 * Роль в превью бывает только рабочей: владельческая сессия в этой
 * cookie ничем легальным не выписывается, и принять её значило бы дать
 * второй, никем не задуманный путь владельческого входа.
 */
async function previewClaims(jar: Awaited<ReturnType<typeof cookies>>): Promise<Claims | null> {
  const token = jar.get(PREVIEW_COOKIE)?.value;
  if (!token) return null;
  const claims = await readToken(token);
  return claims && claims.role === 'staff' ? claims : null;
}

/**
 * Открыть режим «глазами работника».
 *
 * Проверки нарочно по ОСНОВНОЙ cookie, а не по действующей сессии:
 * действующей во время превью становится рабочая, и без этого работник
 * мог бы выписать превью на коллегу. Выписывает всегда владелец, всегда
 * своему работнику, всегда в своей точке.
 *
 * Сессия настоящая — строка в таблице, отзыв, поколение PIN работника.
 * Всё, что человек сделает в превью, продукт запишет так же, как если
 * бы работник сделал это сам, — в этом и смысл сценария.
 */
export async function startWorkerPreview(workerId: string): Promise<boolean> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims || claims.role !== 'owner') return false;
  if (!(await sessionAlive(claims))) return false;

  const [worker] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.id, workerId),
        eq(users.tenantId, claims.tid),
        eq(users.role, 'staff'),
        eq(users.active, true),
      ),
    );
  if (!worker) return false;

  /* Брошенные превью гасятся при следующем входе в режим: cookie
     умирает сама через PREVIEW_MAX_AGE, а строка сессии — здесь. Иначе
     закрытый посреди сценария ноутбук оставлял бы в списке устройств
     работника вечный «вход», который никто не открывал. */
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(sessions.tenantId, claims.tid),
        eq(sessions.device, PREVIEW_DEVICE),
        isNull(sessions.revokedAt),
      ),
    );

  const [row] = await db
    .insert(sessions)
    .values({ tenantId: claims.tid, userId: workerId, kind: 'web', device: PREVIEW_DEVICE })
    .returning();

  /* Поколение — работника: смена его PIN гасит и превью. Так же его
     читает startSession, и расходиться им нельзя. */
  const [ver] = await db
    .select({ n: accounts.tokenVersion, legacy: users.tokenVersion })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, workerId));

  const preview = await signAccess(
    {
      uid: workerId,
      tid: claims.tid,
      role: 'staff',
      sid: row.id,
      ver: ver?.n ?? ver?.legacy ?? 0,
    },
    '12h',
  );

  jar.set(PREVIEW_COOKIE, preview, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: PREVIEW_MAX_AGE,
  });

  return true;
}

/**
 * Выйти из режима работника: cookie удаляется, сессия гасится.
 *
 * Владельца не трогает вовсе — его cookie всё это время лежала рядом,
 * и следующий запрос просто снова работает от неё.
 */
export async function endWorkerPreview(): Promise<void> {
  const jar = await cookies();
  const claims = await previewClaims(jar);
  jar.delete(PREVIEW_COOKIE);
  if (claims?.sid) await revokeSession(claims.sid);
}

/**
 * Сессия по cookie — БЕЗ обращения к базе.
 *
 * Этим пользуются лендинг и окно входа: им нужно лишь понять, есть ли смысл
 * показывать форму. Тянуть ради этого базу нельзя — иначе публичная
 * страница падает вместе с ней.
 *
 * Проверку отзыва делает requireSession, то есть ровно там, где решается
 * доступ к данным.
 */
export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const preview = await previewClaims(jar);
  if (preview) {
    return { uid: preview.uid, tid: preview.tid, role: preview.role, preview: true };
  }
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const claims = await readToken(token);
  return claims && { uid: claims.uid, tid: claims.tid, role: claims.role };
}

/**
 * Жива ли сессия: не отозвана, поколение совпадает, пользователь активен.
 * Один запрос по первичному ключу — дешевле, чем страница, которая её зовёт.
 */
export async function sessionAlive(claims: Claims): Promise<boolean> {
  /* Токены, выпущенные до появления таблицы сессий, sid не имеют. Их
     нельзя ни найти, ни отозвать — но выкинуть их владельцев без
     объяснения тоже нельзя, поэтому проверяем всё, что можно проверить
     без строки сессии. Ветка уйдёт, когда истекут последние такие
     cookie. */
  if (!claims.sid) return aliveWithoutSession(claims);

  const [row] = await db
    .select({
      revokedAt: sessions.revokedAt,
      sessionUserId: sessions.userId,
      membershipTenantId: users.tenantId,
      active: users.active,
      ver: accounts.tokenVersion,
      legacyVer: users.tokenVersion,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(sessions.id, claims.sid));

  if (!row || row.revokedAt || !row.active) return false;

  /* Токен обязан говорить о той же сессии, том же участии и той же
     точке, что и строка в базе. Раньше это не сверялось вообще: доступ
     держался на том, что токен когда-то выписали правильно. Пока у
     человека была одна мойка, разницы не было. С двумя старый токен
     стал бы вечным пропуском в покинутую точку. */
  if (row.sessionUserId !== claims.uid) return false;
  if (row.membershipTenantId !== claims.tid) return false;

  // ver у человека; legacy — для строк, которые ещё не привязаны
  return (row.ver ?? row.legacyVer) === claims.ver;
}

async function aliveWithoutSession(claims: Claims): Promise<boolean> {
  const [row] = await db
    .select({
      tenantId: users.tenantId,
      active: users.active,
      ver: accounts.tokenVersion,
      legacyVer: users.tokenVersion,
    })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, claims.uid));

  if (!row || !row.active) return false;
  if (row.tenantId !== claims.tid) return false;
  return (row.ver ?? row.legacyVer) === claims.ver;
}

/**
 * Перевести текущую сессию на другую точку.
 *
 * Переиспользуем ту же строку, а не заводим новую: устройство осталось
 * тем же устройством. Заводи мы новую, список «мои устройства» рос бы от
 * каждого нажатия, и человек не смог бы отличить свой браузер от чужого.
 *
 * Побочный эффект правильный: устройство, ушедшее на вторую мойку,
 * пропадает из списка устройств первой. Оно там больше и не работает.
 */
export async function switchSession(next: {
  membershipId: string;
  tenantId: string;
  role: Role;
}): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims) redirect('/?auth=signIn');

  const [ver] = await db
    .select({ n: accounts.tokenVersion })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, next.membershipId));

  if (claims.sid) {
    await db
      .update(sessions)
      .set({ tenantId: next.tenantId, userId: next.membershipId, lastSeenAt: new Date() })
      .where(eq(sessions.id, claims.sid));
  }

  const fresh = await signAccess({
    uid: next.membershipId,
    tid: next.tenantId,
    role: next.role,
    sid: claims.sid,
    ver: ver?.n ?? 0,
  });

  jar.set(COOKIE, fresh, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

/**
 * Сессия с проверкой отзыва — там, где решается доступ, но редирект не
 * годится: маршруты, которые отдают файл или собственный ответ.
 *
 * `getSession` для этого не подходит и никогда не подходил: он только
 * разбирает cookie. Cookie живёт тридцать дней, и всё, что решало доступ
 * по нему, продолжало работать месяц после «выйти везде» и после смены
 * PIN — то есть ровно тогда, когда доступ и отбирают.
 */
export async function getLiveSession(): Promise<Session | null> {
  const jar = await cookies();

  /* Живое превью работника сильнее основной cookie: пока оно идёт,
     весь продукт — экран смены, действия, выгрузки — работает от
     работника. Мёртвое (отозванное, просроченное) молча уступает
     владельцу: человек не должен упереться в «сессия закончилась»
     из-за режима, из которого уже вышел. */
  const preview = await previewClaims(jar);
  if (preview && (await sessionAlive(preview))) {
    return { uid: preview.uid, tid: preview.tid, role: preview.role, preview: true };
  }

  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims) return null;
  if (!(await sessionAlive(claims))) return null;

  return { uid: claims.uid, tid: claims.tid, role: claims.role };
}

/**
 * Единственный способ получить сессию в защищённом коде.
 *
 * Server Actions доступны прямым POST-запросом, а не только из нашего UI,
 * поэтому проверка обязана быть ВНУТРИ каждого действия и запроса.
 * Полагаться на proxy.ts нельзя — он только про удобство навигации.
 */
export async function requireSession(): Promise<Session> {
  const jar = await cookies();

  // живое превью работника сильнее основной cookie; мёртвое молча
  // уступает ей — см. заметку в getLiveSession
  const preview = await previewClaims(jar);
  if (preview && (await sessionAlive(preview))) {
    return { uid: preview.uid, tid: preview.tid, role: preview.role, preview: true };
  }

  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims) redirect('/?auth=signIn');

  // отзыв проверяется здесь, а не в getSession: здесь решается доступ
  if (!(await sessionAlive(claims))) redirect('/session-ended');

  return { uid: claims.uid, tid: claims.tid, role: claims.role };
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== 'owner') redirect('/work');
  return session;
}

/**
 * Строка сессии, которой открыт этот браузер.
 *
 * Нужна одному месту — списку устройств: там надо пометить «это
 * устройство», чтобы человек не погасил вход, из которого смотрит, и не
 * решил, что продукт сломался. Ничего, кроме пометки, от неё не зависит,
 * поэтому и отдаётся отдельно, а не подмешивается в `Session`: там она
 * стала бы доступна всему коду, которому решать по ней нечего.
 *
 * Пусто у cookie, выданных до появления таблицы сессий: у них `sid` нет
 * вовсе (см. `sessionAlive`). Тогда просто ни одна строка не помечена.
 */
export async function currentSessionId(): Promise<string | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  return claims?.sid || null;
}
