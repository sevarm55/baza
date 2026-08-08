import { eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, users, type Account } from './db/schema';

/**
 * Человек.
 *
 * До этого файла человека в продукте не существовало: была строка в
 * `users`, и она означала сразу две разные вещи — кто это и где он
 * работает. Пока у каждого была ровно одна мойка, разницы не было
 * видно. Она появляется, когда моек становится две: телефон и код
 * принадлежат человеку, а процент и смена — его работе на конкретной
 * точке.
 *
 * Здесь только про человека. Всё, что про работу, осталось в `users`.
 */

/** Кого мы знаем под этим номером. */
export async function accountByPhone(phone: string): Promise<Account | undefined> {
  const [row] = await db.select().from(accounts).where(eq(accounts.phone, phone));
  return row;
}

/**
 * Человек, которому принадлежит это участие.
 *
 * Обычно достаточно `account_id`. Но колонка появилась миграцией раньше
 * кода, который её заполняет, и между двумя выкатами старый код успевал
 * заводить людей без неё. Такие строки чинятся здесь, по телефону, — по
 * тому самому полю, которое до сих пор было в `users` источником правды.
 *
 * Тихо и на месте, а не отдельным скриптом: строк таких единицы, а
 * скрипт, который надо не забыть запустить, забывают.
 */
export async function accountOf(user: {
  id: string;
  accountId: string | null;
  phone: string;
  pinHash: string;
  tokenVersion: number;
  createdAt: Date;
}): Promise<Account> {
  if (user.accountId) {
    const [row] = await db.select().from(accounts).where(eq(accounts.id, user.accountId));
    if (row) return row;
  }

  const account = await ensureAccount({
    phone: user.phone,
    pinHash: user.pinHash,
    tokenVersion: user.tokenVersion,
    createdAt: user.createdAt,
  });

  await db.update(users).set({ accountId: account.id }).where(eq(users.id, user.id));
  return account;
}

/**
 * Найти человека по номеру или завести.
 *
 * Гонку ловит уникальный индекс, а не проверка перед вставкой: между
 * SELECT и INSERT помещается второй такой же запрос, и два одновременных
 * входа завели бы двух людей с одним номером. `onConflictDoNothing`
 * плюс повторное чтение — единственный способ, который этого не
 * допускает.
 */
export async function ensureAccount(input: {
  phone: string;
  pinHash: string;
  tokenVersion?: number;
  createdAt?: Date;
}): Promise<Account> {
  const [created] = await db
    .insert(accounts)
    .values({
      phone: input.phone,
      pinHash: input.pinHash,
      tokenVersion: input.tokenVersion ?? 0,
      ...(input.createdAt ? { createdAt: input.createdAt } : {}),
    })
    .onConflictDoNothing({ target: accounts.phone })
    .returning();

  if (created) return created;

  const [existing] = await db.select().from(accounts).where(eq(accounts.phone, input.phone));
  return existing;
}

/**
 * Завести человека под новое участие: регистрация бизнеса или наём.
 *
 * Код назначается ТОЛЬКО при создании человека. Это правило, а не
 * деталь: если бы наём умел назначать код тому, кто уже есть, владелец
 * одной мойки вводил бы номер владельца другой, ставил свой код и
 * заходил в чужой бизнес. Здесь такой вход закрыт тем, что переписать
 * код существующему человеку эта функция не умеет вовсе.
 *
 * Осиротевший человек — исключение, и оно безопасное: если участий у
 * него не осталось ни одного, войти под ним некуда, и код можно ставить
 * заново. Так номер и освобождается после удаления бизнеса.
 */
export async function claimAccount(input: { phone: string; pinHash: string }): Promise<Account> {
  const account = await ensureAccount(input);

  const [membership] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.accountId, account.id))
    .limit(1);

  if (!membership && account.pinHash !== input.pinHash) {
    const [reset] = await db
      .update(accounts)
      .set({ pinHash: input.pinHash })
      .where(eq(accounts.id, account.id))
      .returning();
    return reset;
  }

  return account;
}
