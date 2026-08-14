import http2 from 'node:http2';
import { and, eq, inArray, ne, notInArray } from 'drizzle-orm';
import { SignJWT, importPKCS8 } from 'jose';
import { db } from './db';
import { accounts, pushTokens, users } from './db/schema';

/**
 * Пуш-уведомления через APNs.
 *
 * Без внешних библиотек: всё, что нужно, — подписанный ES256 токен и один
 * HTTP/2 запрос. Библиотека принесла бы с собой обновления и несовместимости
 * ради двухсот строк.
 *
 * Ключ, его идентификатор и команда живут в окружении. Файл `.p8` не
 * коммитится и не лежит в образе: он кладётся на сервер один раз, как
 * SESSION_SECRET.
 *
 * Отправка всегда «в фоне»: ни одна запись не должна упасть из-за того,
 * что Apple недоступна. Поэтому все вызовы отсюда — fire-and-forget, а
 * ошибки только пишутся в лог.
 */

const KEY = process.env.APNS_KEY?.replace(/\\n/g, '\n');
const KEY_ID = process.env.APNS_KEY_ID;
const TEAM_ID = process.env.APNS_TEAM_ID;
const TOPIC = process.env.APNS_TOPIC ?? 'com.sevarm.tetr';

export function pushEnabled(): boolean {
  return Boolean(KEY && KEY_ID && TEAM_ID);
}

/**
 * Токен авторизации APNs.
 *
 * Apple требует обновлять его не чаще раза в 20 минут и не реже раза в
 * час. Держим один на 50 минут: чаще — получим TooManyProviderTokenUpdates
 * и перестанем доставлять вовсе.
 */
let cached: { token: string; madeAt: number } | null = null;

async function providerToken(): Promise<string> {
  const now = Date.now();
  if (cached && now - cached.madeAt < 50 * 60_000) return cached.token;

  const key = await importPKCS8(KEY!, 'ES256');
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID! })
    .setIssuer(TEAM_ID!)
    .setIssuedAt()
    .sign(key);

  cached = { token, madeAt: now };
  return token;
}

type Note = {
  title: string;
  body: string;
  /** склейка в одну ветку: сорок машин не должны стать сорока стопками */
  thread?: string;
};

/** Ответ Apple по одному токену: живой он или его пора выкинуть. */
type Delivery = { token: string; status: number; reason?: string };

function sendOne(host: string, jwt: string, token: string, note: Note): Promise<Delivery> {
  return new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    const payload = JSON.stringify({
      aps: {
        alert: { title: note.title, body: note.body },
        sound: 'default',
        'thread-id': note.thread,
        'interruption-level': 'active',
      },
    });

    const request = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      // без него Apple отвечает 403 MissingProviderToken на любой запрос
      authorization: `bearer ${jwt}`,
      'apns-topic': TOPIC,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let raw = '';

    request.on('response', (headers) => {
      status = Number(headers[':status'] ?? 0);
    });
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => {
      client.close();
      let reason: string | undefined;
      try {
        reason = raw ? (JSON.parse(raw) as { reason?: string }).reason : undefined;
      } catch {
        reason = raw || undefined;
      }
      resolve({ token, status, reason });
    });
    request.on('error', () => {
      client.close();
      resolve({ token, status: 0, reason: 'NETWORK' });
    });

    request.end(payload);
  });
}

/**
 * Отправить уведомление людям по их токенам.
 *
 * Мёртвые токены удаляем сразу: Apple отвечает 410 Unregistered, когда
 * приложение снесли, и BadDeviceToken — когда токен из другого контура.
 * Не убирать их значит копить мусор и каждый раз ходить в Apple впустую.
 */
async function deliver(rows: { token: string; sandbox: boolean }[], note: Note) {
  if (!pushEnabled() || rows.length === 0) return;

  const jwt = await providerToken();
  const results = await Promise.all(
    rows.map((r) =>
      sendOne(r.sandbox ? 'api.sandbox.push.apple.com' : 'api.push.apple.com', jwt, r.token, note),
    ),
  );

  const dead = results
    .filter((r) => r.status === 410 || r.reason === 'BadDeviceToken' || r.reason === 'Unregistered')
    .map((r) => r.token);

  if (dead.length > 0) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, dead));
  }

  for (const r of results) {
    if (r.status !== 200 && !dead.includes(r.token)) {
      console.warn(`[push] ${r.status} ${r.reason ?? ''}`);
    }
  }
}

/**
 * Уведомить владельцев бизнеса.
 *
 * Себя не уведомляем: владелец, который сам моет машины, не должен
 * получать уведомление о собственной записи — это первое, что заставляет
 * выключить уведомления совсем.
 */
export async function notifyOwners(
  tenantId: string,
  actorId: string | null,
  note: Note,
  need?: 'orders',
) {
  if (!pushEnabled()) return;

  const rows = await db
    .select({ token: pushTokens.token, sandbox: pushTokens.sandbox })
    .from(pushTokens)
    .innerJoin(users, eq(users.id, pushTokens.userId))
    .where(
      and(
        eq(pushTokens.tenantId, tenantId),
        eq(users.role, 'owner'),
        eq(users.active, true),
        actorId ? ne(users.id, actorId) : undefined,
        need === 'orders' ? eq(users.notifyOrders, true) : undefined,
      ),
    );

  await deliver(rows, note);
}

/**
 * Уведомить одного человека — того, кому назначили машину.
 *
 * Владельцам шлём широковещательно, потому что их двое-трое и повод
 * общий. Наряд — обратный случай: он адресный, и получить его должен
 * ровно тот мойщик, которому машину отдали. Прилетевшее не тебе
 * уведомление хуже, чем никакого: после второго такого выключают все.
 *
 * Себя не уведомляем. Владелец маленькой мойки моет сам и назначает
 * машину на себя же — уведомление о собственном действии выглядит
 * поломкой продукта.
 */
export async function notifyUser(tenantId: string, userId: string, actorId: string | null, note: Note) {
  if (!pushEnabled() || userId === actorId) return;

  const rows = await db
    .select({ token: pushTokens.token, sandbox: pushTokens.sandbox })
    .from(pushTokens)
    .innerJoin(users, eq(users.id, pushTokens.userId))
    .where(
      and(
        eq(pushTokens.tenantId, tenantId),
        eq(pushTokens.userId, userId),
        eq(users.active, true),
      ),
    );

  await deliver(rows, note);
}

/** То же, но никогда не бросает: зовётся из путей записи. */
export function notifyUserInBackground(
  tenantId: string,
  userId: string,
  actorId: string | null,
  note: Note,
) {
  void notifyUser(tenantId, userId, actorId, note).catch((e) => {
    console.warn('[push] мойщику не отправилось:', e);
  });
}

/**
 * Уведомить владельца платформы — вас, а не клиента.
 *
 * Два события решают, станет зарегистрировавшийся платящим: он завёл
 * бизнес, и у него кончается срок. Оба происходят в конкретный день, и
 * позвонить надо именно тогда. Узнавать о них, зайдя в админку, — значит
 * узнавать поздно.
 *
 * Получатели те же, что имеют доступ в админку: список телефонов лежит в
 * настройках сервера, и второго места, где выдаются права, заводить не
 * надо.
 */
export async function notifyPlatform(note: Note) {
  if (!pushEnabled()) return;

  const phones = (process.env.PLATFORM_ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  if (phones.length === 0) return;

  /* Номер ищем у человека, а не в копии на участии: копия доживает свой
     век и однажды исчезнет. */
  const rows = await db
    .select({ token: pushTokens.token, sandbox: pushTokens.sandbox })
    .from(pushTokens)
    .innerJoin(users, eq(users.id, pushTokens.userId))
    .innerJoin(accounts, eq(accounts.id, users.accountId))
    .where(and(inArray(accounts.phone, phones), eq(users.active, true)));

  /* По строке на каждое участие — значит у админа с двумя точками один и
     тот же телефон встретится дважды, и уведомление придёт двойным. */
  const once = new Map(rows.map((r) => [r.token, r]));
  await deliver([...once.values()], note);
}

export function notifyPlatformInBackground(note: Note) {
  void notifyPlatform(note).catch((e) => {
    console.warn('[push] платформе не отправилось:', e);
  });
}

/** То же, но никогда не бросает: зовётся из путей записи. */
export function notifyOwnersInBackground(
  tenantId: string,
  actorId: string | null,
  note: Note,
  need?: 'orders',
) {
  void notifyOwners(tenantId, actorId, note, need).catch((e) => {
    console.warn('[push] не отправилось:', e);
  });
}

/** Запомнить токен устройства. Повторная присылка того же — не ошибка. */
export async function rememberToken(input: {
  tenantId: string;
  userId: string;
  /** чей это человек: по нему отличаем «его вторая точка» от «чужой телефон» */
  accountId: string;
  token: string;
  sandbox: boolean;
}) {
  /* Телефон мог перейти к другому человеку — тогда все чужие строки с
     этим токеном надо снять, иначе прежний владелец продолжит получать
     уведомления о чужой мойке. Своих строк это не касается: у человека с
     двумя точками их две, по одной на участие, и обе нужны.

     Это единственное место во всей затее, где ошибка отправляет данные
     наружу, а не просто отказывает. */
  await db.delete(pushTokens).where(
    and(
      eq(pushTokens.token, input.token),
      notInArray(
        pushTokens.userId,
        db.select({ id: users.id }).from(users).where(eq(users.accountId, input.accountId)),
      ),
    ),
  );

  await db
    .insert(pushTokens)
    .values({
      tenantId: input.tenantId,
      userId: input.userId,
      token: input.token,
      sandbox: input.sandbox,
    })
    .onConflictDoUpdate({
      target: [pushTokens.token, pushTokens.userId],
      set: { tenantId: input.tenantId, sandbox: input.sandbox, seenAt: new Date() },
    });
}

export async function forgetToken(token: string) {
  await db.delete(pushTokens).where(eq(pushTokens.token, token));
}
