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

  /* Одним запросом, и при совпадении по номеру — ПЕРЕЗАПИСЫВАЕМ чужую
     строку своей копией, а не усыновляем её.

     Разница тут не косметическая. Найденный по номеру человек может
     оказаться осиротевшим от удалённого бизнеса, с чужим кодом внутри;
     усынови мы его — и код входа в это участие молча стал бы чужим:
     хозяин перестал бы входить своим, а тот, кто знает старый, начал бы
     входить.

     Перезапись безопасна, пока жив users_phone_uniq: он гарантирует, что
     строка users с этим номером в базе одна — вот эта. Значит найденный
     человек участий не имеет, и терять в нём нечего. Когда индекс
     снимется, этот путь должен уйти вместе с ним. */
  const [account] = await db
    .insert(accounts)
    .values({
      phone: user.phone,
      pinHash: user.pinHash,
      tokenVersion: user.tokenVersion,
      createdAt: user.createdAt,
    })
    .onConflictDoUpdate({
      target: accounts.phone,
      set: { pinHash: user.pinHash, tokenVersion: user.tokenVersion },
    })
    .returning();

  await db.update(users).set({ accountId: account.id }).where(eq(users.id, user.id));
  return account;
}

/** Номер уже принадлежит человеку. */
export class PhoneTakenError extends Error {
  constructor() {
    super('PHONE_TAKEN');
  }
}

/**
 * Завести человека под новое участие: регистрация бизнеса или наём.
 *
 * Код назначается ТОЛЬКО при создании человека, и переписать его эта
 * функция не умеет вовсе. Это правило, а не деталь: умей она ставить
 * код тому, кто уже есть, владелец одной мойки ввёл бы номер владельца
 * другой, назначил свой код и вошёл бы в чужой бизнес.
 *
 * Номер занят — отказ, и не «наверное занят», а по уникальному индексу.
 * Проверка перед вставкой такой гарантии не даёт: между SELECT и INSERT
 * помещается второй такой же запрос. Первая версия этой функции как раз
 * читала `users`, чтобы решить «человек осиротел, код можно заменить», —
 * и решала это по строке, которую соседняя незакоммиченная транзакция
 * ещё не вставила. Две одновременные регистрации на свободный номер
 * заканчивались тем, что код второго ложился на бизнес первого: хозяин
 * не входил своим, а чужой входил владельцем.
 *
 * Номер после удаления бизнеса освобождается не здесь, а тем, что
 * `deleteBusiness` уносит человека без единого участия.
 */
export async function claimAccount(input: { phone: string; pinHash: string }): Promise<Account> {
  const [created] = await db
    .insert(accounts)
    .values({ phone: input.phone, pinHash: input.pinHash })
    .onConflictDoNothing({ target: accounts.phone })
    .returning();

  if (!created) throw new PhoneTakenError();
  return created;
}
