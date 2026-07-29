import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { sessions, users } from '../db/schema';
import { signAccess, type Role } from '../auth';

/**
 * Токены для приложения.
 *
 * Две штуки, и у каждого своя работа:
 *
 *   access  — короткий JWT на 15 минут. Проверяется подписью, без базы,
 *             поэтому дешёвый: его показывают на каждый запрос.
 *   refresh — длинный, лежит в базе хешем и умеет отзываться. Только он
 *             даёт новый access.
 *
 * Пятнадцать минут — компромисс: столько живёт украденный access, если
 * сессию отозвали. Меньше — лишние round-trip на плохой связи, больше —
 * отзыв перестаёт быть мгновенным.
 *
 * Хеш здесь sha256, а не scrypt как у PIN. Разница не в небрежности:
 * refresh это 32 случайных байта, перебирать там нечего, а scrypt на
 * каждом обновлении токена — заметная трата на ровном месте.
 */

export const ACCESS_TTL = '15m';
/** Сколько живёт refresh без использования. */
export const REFRESH_DAYS = 60;

function hash(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/**
 * Токен несёт в себе id сессии: иначе пришлось бы искать по хешу
 * перебором всей таблицы. Секретная часть при этом остаётся секретной —
 * в базе только её хеш.
 */
function mint(sessionId: string): { token: string; hash: string } {
  const secret = randomBytes(32).toString('base64url');
  return { token: `${sessionId}.${secret}`, hash: hash(secret) };
}

export type Issued = {
  access: string;
  refresh: string;
  sessionId: string;
  expiresIn: number;
};

/** Новая сессия приложения: строка в базе плюс оба токена. */
export async function issueForDevice(params: {
  tenantId: string;
  userId: string;
  role: Role;
  device: string | null;
}): Promise<Issued> {
  const [row] = await db
    .insert(sessions)
    .values({
      tenantId: params.tenantId,
      userId: params.userId,
      kind: 'app',
      device: params.device,
    })
    .returning();

  const [user] = await db
    .select({ ver: users.tokenVersion })
    .from(users)
    .where(eq(users.id, params.userId));

  const { token, hash: refreshHash } = mint(row.id);
  await db.update(sessions).set({ refreshHash }).where(eq(sessions.id, row.id));

  const access = await signAccess(
    { uid: params.userId, tid: params.tenantId, role: params.role, sid: row.id, ver: user?.ver ?? 0 },
    ACCESS_TTL,
  );

  return { access, refresh: token, sessionId: row.id, expiresIn: 15 * 60 };
}

export class RefreshRejected extends Error {}

/**
 * Обменять refresh на новую пару.
 *
 * Старый refresh при этом умирает — так называемая ротация. Смысл в том,
 * что украденный токен работает ровно один раз: как только настоящий
 * владелец обновится следующим, чужой перестанет подходить.
 */
export async function rotate(token: string): Promise<Issued> {
  const dot = token.indexOf('.');
  if (dot < 1) throw new RefreshRejected();

  const sid = token.slice(0, dot);
  const secret = token.slice(dot + 1);

  const [row] = await db
    .select({
      id: sessions.id,
      tenantId: sessions.tenantId,
      userId: sessions.userId,
      refreshHash: sessions.refreshHash,
      role: users.role,
      ver: users.tokenVersion,
      active: users.active,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)));

  if (!row || !row.refreshHash || !row.active) throw new RefreshRejected();
  if (!same(row.refreshHash, hash(secret))) throw new RefreshRejected();

  const next = mint(row.id);
  await db
    .update(sessions)
    .set({ refreshHash: next.hash, lastSeenAt: new Date() })
    .where(eq(sessions.id, row.id));

  const role: Role = row.role === 'owner' ? 'owner' : 'staff';
  const access = await signAccess(
    { uid: row.userId, tid: row.tenantId, role, sid: row.id, ver: row.ver },
    ACCESS_TTL,
  );

  return { access, refresh: next.token, sessionId: row.id, expiresIn: 15 * 60 };
}

/** Погасить сессию по refresh-токену — выход из приложения. */
export async function revokeByRefresh(token: string): Promise<void> {
  const dot = token.indexOf('.');
  if (dot < 1) return;
  await db
    .update(sessions)
    .set({ revokedAt: new Date(), refreshHash: null })
    .where(eq(sessions.id, token.slice(0, dot)));
}
