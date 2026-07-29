import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { sessions, users } from './db/schema';

export { hashPin, verifyPin } from './pin';

const COOKIE = 'bz_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 дней — сотрудник не должен логиниться каждый день

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
export type Session = { uid: string; tid: string; role: Role };
/** То же плюс поля, по которым сессию можно отозвать. */
export type Claims = Session & { sid: string; ver: number };

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
  opts: { kind?: 'web' | 'app'; device?: string } = {},
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

  const [user] = await db
    .select({ ver: users.tokenVersion })
    .from(users)
    .where(eq(users.id, session.uid));

  const token = await signAccess({ ...session, sid: row.id, ver: user?.ver ?? 0 });

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });

  return row.id;
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  jar.delete(COOKIE);

  // cookie удалена у себя, но токен мог быть скопирован — гасим и в базе
  const claims = token ? await readToken(token) : null;
  if (claims?.sid) await revokeSession(claims.sid);
}

export async function revokeSession(sid: string): Promise<void> {
  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)));
}

/** Выйти на всех устройствах: и строки погасить, и поколение сдвинуть. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userId, userId), isNull(sessions.revokedAt)));
    await tx
      .update(users)
      .set({ tokenVersion: sql`${users.tokenVersion} + 1` })
      .where(eq(users.id, userId));
  });
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
  // токены, выпущенные до появления таблицы, sid не имеют — пусть доживают
  if (!claims.sid) return true;

  const [row] = await db
    .select({ revokedAt: sessions.revokedAt, ver: users.tokenVersion, active: users.active })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, claims.sid));

  if (!row || row.revokedAt || !row.active) return false;
  return row.ver === claims.ver;
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
  const token = jar.get(COOKIE)?.value;
  const claims = token ? await readToken(token) : null;
  if (!claims) redirect('/login');

  // отзыв проверяется здесь, а не в getSession: здесь решается доступ
  if (!(await sessionAlive(claims))) redirect('/session-ended');

  return { uid: claims.uid, tid: claims.tid, role: claims.role };
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== 'owner') redirect('/work');
  return session;
}
