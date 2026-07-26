import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';

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

/* ---------------------------- сессия ----------------------------- */

export async function startSession(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret);

  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: MAX_AGE,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret);
    const { uid, tid, role } = payload as Record<string, unknown>;
    if (typeof uid !== 'string' || typeof tid !== 'string') return null;
    if (role !== 'owner' && role !== 'staff') return null;
    return { uid, tid, role };
  } catch {
    return null;
  }
}

/**
 * Единственный способ получить сессию в защищённом коде.
 *
 * Server Actions доступны прямым POST-запросом, а не только из нашего UI,
 * поэтому проверка обязана быть ВНУТРИ каждого действия и запроса.
 * Полагаться на proxy.ts нельзя — он только про удобство навигации.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect('/login');
  return session;
}

export async function requireOwner(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== 'owner') redirect('/work');
  return session;
}
