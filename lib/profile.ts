import { eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, tenants, users } from './db/schema';
import { hashPin, hasPin, verifyPin } from './pin';
import { pinProblem } from './phone';
import { revokeAccountSessions } from './auth';
import { accountOf } from './accounts';

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
  constructor(code: 'BAD_PIN' | 'TRIVIAL_PIN' | 'WRONG_PIN' | 'BAD_NAME') {
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
  /* «Мало цифр» и «слишком очевидный» — разные беды. Общий ответ на них
     заставляет человека гадать, что именно не так с кодом, который он
     только что придумал. */
  const bad = pinProblem(next);
  if (bad === 'length') throw new ProfileError('BAD_PIN');
  if (bad === 'trivial') throw new ProfileError('TRIVIAL_PIN');

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new ProfileError('WRONG_PIN');

  /* Код принадлежит человеку, а не его работе на точке. У кого две
     мойки, тот входит одним кодом в обе — и меняет его один раз. */
  const account = await accountOf(user);

  /* Текущий код спрашивается, только если он есть. У тех, кто завёл
     мойку по коду из SMS, его нет вовсе, и вопрос «введите текущий»
     был бы неотвечаемым: они бы навсегда остались без второй двери.
     Дыры здесь нет — человек уже вошёл, а вход и есть доказательство,
     что это он. */
  const had = hasPin(account.pinHash);
  if (had && !(await verifyPin(current, account.pinHash))) {
    throw new ProfileError('WRONG_PIN');
  }

  const pinHash = await hashPin(next);
  /* Одной транзакцией: оборвись она между двумя записями, у человека
     остался бы новый код на входе и старый в подтверждении удаления
     бизнеса — и он не смог бы ни то, ни другое объяснить. */
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ pinHash }).where(eq(accounts.id, account.id));
    // копия, пока схема обязана оставаться совместимой со старым кодом
    await tx.update(users).set({ pinHash }).where(eq(users.accountId, account.id));
  });

  /* Выходим везде — но только при СМЕНЕ.

     Смысл выхода в том, что тот, у кого старый код уже есть, перестаёт
     работать. Когда кода не было вовсе, отбирать нечего: человек просто
     завёл себе вторую дверь. Выкидывать его за это из собственного
     кабинета — наказание за предусмотрительность, и выглядит оно как
     падение страницы, а не как забота о безопасности. */
  if (had) await revokeAccountSessions(account.id);

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
