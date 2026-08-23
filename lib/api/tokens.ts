import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db';
import { accounts, sessions, users } from '../db/schema';
import { signAccess, type Role } from '../auth';
import { isUuid } from './respond';

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

  /* Поколение сессий живёт у человека, а не у его работы на точке:
     сменил код — вышел из всех своих моек разом. legacyVer нужен, пока
     встречаются участия, не привязанные к человеку. */
  const [user] = await db
    .select({ ver: accounts.tokenVersion, legacyVer: users.tokenVersion })
    .from(users)
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(eq(users.id, params.userId));

  const { token, hash: refreshHash } = mint(row.id);
  await db.update(sessions).set({ refreshHash }).where(eq(sessions.id, row.id));

  const access = await signAccess(
    {
      uid: params.userId,
      tid: params.tenantId,
      role: params.role,
      sid: row.id,
      ver: user?.ver ?? user?.legacyVer ?? 0,
    },
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

  // подделанный токен — это отказ, а не поломка сервера
  if (!isUuid(sid) || !secret) throw new RefreshRejected();

  const [row] = await db
    .select({
      id: sessions.id,
      tenantId: sessions.tenantId,
      userId: sessions.userId,
      refreshHash: sessions.refreshHash,
      role: users.role,
      ver: accounts.tokenVersion,
      legacyVer: users.tokenVersion,
      active: users.active,
      blockedAt: accounts.blockedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .leftJoin(accounts, eq(accounts.id, users.accountId))
    .where(and(eq(sessions.id, sid), isNull(sessions.revokedAt)));

  if (!row || !row.refreshHash || !row.active || row.blockedAt) throw new RefreshRejected();
  if (!same(row.refreshHash, hash(secret))) throw new RefreshRejected();

  const next = mint(row.id);
  await db
    .update(sessions)
    .set({ refreshHash: next.hash, lastSeenAt: new Date() })
    .where(eq(sessions.id, row.id));

  const role: Role = row.role === 'owner' ? 'owner' : 'staff';
  const access = await signAccess(
    { uid: row.userId, tid: row.tenantId, role, sid: row.id, ver: row.ver ?? row.legacyVer },
    ACCESS_TTL,
  );

  return { access, refresh: next.token, sessionId: row.id, expiresIn: 15 * 60 };
}

/**
 * Погасить сессию по refresh-токену — выход из приложения.
 *
 * Секрет сверяется так же, как при ротации, и это не формальность:
 * идентификатор сессии не секрет — он лежит в токене целиком и виден в
 * списке устройств. Без сверки любой, кто его узнал, гасил бы чужую
 * сессию, ничего больше не зная. Гасить нужно предъявившему токен, а не
 * назвавшему номер.
 */
export async function revokeByRefresh(token: string): Promise<void> {
  const dot = token.indexOf('.');
  if (dot < 1) return;
  const sid = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!isUuid(sid) || !secret) return;

  const [row] = await db
    .select({ refreshHash: sessions.refreshHash })
    .from(sessions)
    .where(eq(sessions.id, sid));

  /* Уже погашенная сессия хранит null — выход второй раз подряд просто
     ничего не делает, и это не ошибка: приложение шлёт выход и при
     потере ответа повторяет. */
  if (!row?.refreshHash) return;
  if (!same(row.refreshHash, hash(secret))) return;

  await db
    .update(sessions)
    .set({ revokedAt: new Date(), refreshHash: null })
    .where(eq(sessions.id, sid));
}
