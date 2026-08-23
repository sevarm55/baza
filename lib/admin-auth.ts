import { timingSafeEqual } from 'node:crypto';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { db } from './db';
import { adminAudit, adminSessions } from './db/schema';
import { hasPin, verifyPin } from './pin';
import { checkLogin, clientIp, noteLogin } from './login-guard';
import { logSecurity } from './security-log';

/**
 * Вход и сессии админки платформы.
 *
 * Один вход, и он принадлежит владельцу платформы лично: логин и пароль
 * задаются переменными окружения `ADMIN_LOGIN` и `ADMIN_PASSWORD` (или
 * `ADMIN_PASSWORD_HASH` со scrypt-хешем из `scripts/admin-password.ts`).
 * В базе учётных данных нет вовсе: чтобы попасть в админку, мало
 * добраться до базы, нужен доступ к настройкам сервера. Кодов из SMS
 * здесь нет по решению владельца: вход одним паролем, поэтому пароль
 * обязан быть длинным, а перебор придушен тем же счётчиком, что у
 * входа в кабинет.
 *
 * От кабинета вход отделён полностью: своя cookie `bz_admin`
 * (SameSite=Strict, только под /admin), свой срок: двенадцать часов и
 * два часа простоя. Здесь отключают бизнесы и правят чужие подписки, и
 * забытая вкладка не должна оставаться ключом на месяц.
 */

export const ADMIN_COOKIE = 'bz_admin';
const SESSION_HOURS = 12;
const IDLE_MINUTES = 120;
const TOUCH_MINUTES = 2;

/* Роль одна: владелец платформы. Тип и проверка остаются, чтобы код
   страниц не менялся, если однажды снова появятся помощники. */
export type AdminRole = 'owner' | 'support' | 'viewer';
export function roleAtLeast(_role: AdminRole, _need: AdminRole): boolean {
  return true;
}

/* Ключ подписи свой, выведенный из общего: утечка одного секрета не
   должна подписывать cookie другого контура. */
const secret = new TextEncoder().encode(
  `admin:${process.env.ADMIN_SESSION_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-insecure-secret-please-change-me-now'}`,
);

type AdminClaims = { login: string; sid: string };

async function sign(claims: AdminClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret);
}

async function read(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { login, sid } = payload as Record<string, unknown>;
    return typeof login === 'string' && typeof sid === 'string' ? { login, sid } : null;
  } catch {
    return null;
  }
}

/** Заданы ли учётные данные: без них входа нет, и страница честно говорит об этом. */
export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_LOGIN && (process.env.ADMIN_PASSWORD_HASH || process.env.ADMIN_PASSWORD));
}

function sameString(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  /* Сравнение всегда полное: ранний выход по длине подсказывал бы её. */
  const same = x.length === y.length;
  const probe = same ? y : x;
  return timingSafeEqual(x, probe) && same;
}

async function verifyPassword(given: string): Promise<boolean> {
  const hash = process.env.ADMIN_PASSWORD_HASH;
  if (hash && hasPin(hash)) return verifyPin(given, hash);
  const plain = process.env.ADMIN_PASSWORD;
  if (plain) return sameString(given, plain);
  return false;
}

/* ------------------------------ вход ------------------------------ */

export type AdminLogin =
  | { ok: true }
  | { ok: false; problem: 'DENIED' | 'THROTTLED' | 'NOT_CONFIGURED'; retryAfter?: number };

/**
 * Вход: логин и пароль из окружения. Ответ на «не тот логин» и «не тот
 * пароль» один и тот же, а перебор считает тот же счётчик, что у входа
 * в кабинет: ключ синтетический, с решёткой, чтобы не пересечься ни с
 * одним настоящим номером.
 */
export async function adminLogin(input: {
  login: string;
  password: string;
  ip: string | null;
  agent?: string | null;
}): Promise<AdminLogin> {
  if (!adminConfigured()) return { ok: false, problem: 'NOT_CONFIGURED' };

  const login = input.login.trim();
  const throttleKey = `#admin:${login.toLowerCase().slice(0, 64)}`;

  const guard = await checkLogin(throttleKey, input.ip);
  if (!guard.allowed) {
    await logSecurity({ event: 'auth.login.throttled', ip: input.ip, data: { flow: 'admin' } });
    return { ok: false, problem: 'THROTTLED', retryAfter: guard.retryAfter };
  }

  const loginOk = sameString(login, process.env.ADMIN_LOGIN ?? '');
  /* Пароль проверяется всегда, даже при чужом логине: время ответа не
     должно говорить, какая из половин не подошла. */
  const passwordOk = await verifyPassword(input.password);
  const good = loginOk && passwordOk;

  await noteLogin(throttleKey, input.ip, good);

  if (!good) {
    await logSecurity({
      event: 'admin.login.failed',
      ip: input.ip,
      agent: input.agent,
      data: { login: login.slice(0, 64) },
    });
    return { ok: false, problem: 'DENIED' };
  }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  const [session] = await db
    .insert(adminSessions)
    .values({ login, ip: input.ip, agent: input.agent?.slice(0, 200) ?? null, expiresAt })
    .returning();

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await sign({ login, sid: session.id }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_HOURS * 3600,
  });

  await logSecurity({ event: 'admin.login.success', ip: input.ip, agent: input.agent, data: { login } });
  return { ok: true };
}

/* ----------------------------- сессия ----------------------------- */

export type AdminContext = {
  /** логин владельца платформы: им подписывается журнал */
  name: string;
  role: AdminRole;
  sessionId: string;
};

/**
 * Кто сейчас в админке: cookie → живая сессия → логин совпадает с
 * текущим в окружении. Смена логина на сервере гасит старые сессии.
 * Простой считается по `last_seen_at`: два часа без запросов закрывают
 * сессию, даже если cookie ещё не истекла. Отметка времени пишется не
 * чаще раза в две минуты, чтобы каждая страница не обновляла строку.
 */
export async function getAdmin(): Promise<AdminContext | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const claims = token ? await read(token) : null;
  if (!claims) return null;
  if (!adminConfigured() || !sameString(claims.login, process.env.ADMIN_LOGIN ?? '')) return null;

  const [row] = await db.select().from(adminSessions).where(eq(adminSessions.id, claims.sid));
  if (!row || row.login !== claims.login) return null;

  const now = Date.now();
  if (row.revokedAt || row.expiresAt.getTime() < now) return null;
  if (row.lastSeenAt.getTime() < now - IDLE_MINUTES * 60_000) return null;

  if (row.lastSeenAt.getTime() < now - TOUCH_MINUTES * 60_000) {
    await db.update(adminSessions).set({ lastSeenAt: new Date() }).where(eq(adminSessions.id, row.id));
  }

  return { name: claims.login, role: 'owner', sessionId: row.id };
}

/** Единственный способ попасть в защищённый код админки. */
export async function requireAdmin(_need: AdminRole = 'viewer'): Promise<AdminContext> {
  const ctx = await getAdmin();
  if (!ctx) redirect('/admin/login');
  return ctx;
}

export async function adminSignOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const claims = token ? await read(token) : null;
  jar.delete({ name: ADMIN_COOKIE, path: '/admin' });
  if (claims) {
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.id, claims.sid), isNull(adminSessions.revokedAt)));
    await logSecurity({ event: 'admin.logout', data: { login: claims.login } });
  }
}

/** Погасить одну сессию админки: чужой браузер, забытая вкладка. */
export async function revokeAdminSession(sessionId: string, by: AdminContext): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));
  await logSecurity({ event: 'admin.session.revoked', data: { login: by.name, sessionId } });
}

/** Открытые сессии админки: их одна-две, и все принадлежат владельцу. */
export async function listAdminSessions() {
  return db
    .select()
    .from(adminSessions)
    .where(and(isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, new Date())))
    .orderBy(desc(adminSessions.lastSeenAt));
}

/* ----------------------------- журнал ----------------------------- */

export type AdminAction =
  | 'subscription.extend'
  | 'tenant.block'
  | 'tenant.unblock'
  | 'tenant.note'
  | 'tenant.view'
  | 'account.block'
  | 'account.unblock'
  | 'account.logout_all'
  | 'account.reset_access'
  | 'account.view'
  | 'admin.session_revoke';

/** Адрес из запроса; вне запроса (скрипт) его нет, и это не ошибка. */
async function requestIp(): Promise<string | null> {
  try {
    return clientIp(await headers());
  } catch {
    return null;
  }
}

/**
 * След действия админа. Пишется всегда, и всегда с причиной там, где
 * действие опасное: «кто и почему» отвечает на вопрос через год.
 */
export async function logAdminAction(input: {
  by: AdminContext;
  action: AdminAction;
  targetType?: 'tenant' | 'account' | 'session';
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
  /** адрес вызывающего; вне запроса (скрипты, проверки) можно не передавать */
  ip?: string | null;
  now?: Date;
}): Promise<boolean> {
  const now = input.now ?? new Date();
  /* Просмотр пишется раз в полчаса на цель: иначе журнал состоял бы из
     сотни «открыл» подряд после каждого обновления страницы, и найти в
     нём продление стало бы невозможно. */
  if ((input.action === 'tenant.view' || input.action === 'account.view') && input.targetId) {
    const since = new Date(now.getTime() - 30 * 60_000);
    const [recent] = await db
      .select({ id: adminAudit.id })
      .from(adminAudit)
      .where(
        and(
          eq(adminAudit.adminName, input.by.name),
          eq(adminAudit.action, input.action),
          eq(adminAudit.targetId, input.targetId),
          gt(adminAudit.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return false;
  }

  const ip = input.ip !== undefined ? input.ip : await requestIp();
  await db.insert(adminAudit).values({
    adminName: input.by.name,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel?.slice(0, 120) ?? null,
    reason: input.reason?.trim().slice(0, 500) || null,
    data: input.data ?? null,
    ip,
    createdAt: now,
  });
  if (input.action !== 'tenant.view' && input.action !== 'account.view') {
    await logSecurity({
      event: 'admin.action',
      ip,
      data: { login: input.by.name, action: input.action, target: input.targetId ?? undefined },
    });
  }
  return true;
}
