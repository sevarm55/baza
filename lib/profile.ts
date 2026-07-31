import { eq } from 'drizzle-orm';
import { db } from './db';
import { tenants, users } from './db/schema';
import { hashPin, verifyPin } from './pin';
import { isValidPin } from './phone';
import { revokeAllSessions } from './auth';

/**
 * Профиль: имя, название бизнеса, PIN.
 *
 * Смены PIN до сих пор не было нигде — ни в приложении, ни в кабинете.
 * При этом механизм под неё был построен с самого начала: `tokenVersion`
 * в таблице пользователей существует ровно для того, чтобы при смене PIN
 * все выданные токены умерли разом. Здесь он наконец используется.
 *
 * Это не удобство, а безопасность. PIN диктуют работнику вслух, телефон
 * владельца лежит на мойке, работника однажды увольняют — и до сих пор
 * закрыть доступ было нечем.
 */

export class ProfileError extends Error {
  constructor(code: 'BAD_PIN' | 'WRONG_PIN' | 'BAD_NAME') {
    super(code);
  }
}

/**
 * Сменить PIN.
 *
 * Старый спрашиваем обязательно: телефон может быть разблокирован и лежать
 * на столе, и смена PIN без подтверждения означала бы, что случайный
 * человек рядом отбирает аккаунт целиком.
 *
 * После смены гасим все сессии — в этом весь смысл. Оставить их значило
 * бы, что тот, у кого старый PIN уже есть, продолжает работать как ни в
 * чём не бывало.
 */
export async function changePin(userId: string, current: string, next: string) {
  if (!isValidPin(next)) throw new ProfileError('BAD_PIN');

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new ProfileError('WRONG_PIN');

  if (!(await verifyPin(current, user.pinHash))) throw new ProfileError('WRONG_PIN');

  await db.update(users).set({ pinHash: await hashPin(next) }).where(eq(users.id, userId));
  await revokeAllSessions(userId);

  return user;
}

/**
 * Имя человека и название бизнеса.
 *
 * Название бизнеса меняет только владелец — оно общее, а не личное.
 * Проверку роли делает вызывающий: у него уже есть контекст запроса.
 */
export async function saveProfile(input: {
  userId: string;
  tenantId: string;
  name?: string;
  businessName?: string;
}) {
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name.length < 2) throw new ProfileError('BAD_NAME');
    await db.update(users).set({ name }).where(eq(users.id, input.userId));
  }

  if (input.businessName !== undefined) {
    const businessName = input.businessName.trim();
    if (businessName.length < 2) throw new ProfileError('BAD_NAME');
    await db.update(tenants).set({ name: businessName }).where(eq(tenants.id, input.tenantId));
  }
}
