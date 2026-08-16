import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, tenants, users, type Account } from './db/schema';
import { currentAccess, type Access } from './subscription';

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

  /* Заводим человека из СВОЕЙ копии и только если номер свободен.

     Раньше здесь стояла перезапись чужой строки, и она была безопасна
     ровно потому, что жил users_phone_uniq: он гарантировал, что участие
     с этим номером в базе одно. Индекса больше нет — гарантии тоже, и
     перезапись превратилась бы в кражу чужого кода.

     Совпадение теперь означает настоящего другого человека. Гадать в
     таком месте нельзя: лучше громко упасть, чем тихо привязать участие
     не к тому. Строк без человека в проде ноль, так что эта ветка —
     сигнализация, а не рабочий путь. */
  const [created] = await db
    .insert(accounts)
    .values({
      phone: user.phone,
      pinHash: user.pinHash,
      tokenVersion: user.tokenVersion,
      createdAt: user.createdAt,
    })
    .onConflictDoNothing({ target: accounts.phone })
    .returning();

  if (!created) {
    throw new Error(`ACCOUNT_CONFLICT: участие ${user.id} и чужой человек делят ${user.phone}`);
  }
  const account = created;

  await db.update(users).set({ accountId: account.id }).where(eq(users.id, user.id));
  return account;
}

/** Точка, где человек работает. */
export type Point = {
  id: string;
  name: string;
  role: 'owner' | 'staff';
  /** id участия на этой точке — им подписывается токен */
  membershipId: string;
  state: Access['state'];
  canRead: boolean;
  /** сколько дней осталось; 0 — считать нечего */
  daysLeft: number;
};

/**
 * Точки человека — то, между чем он переключается.
 *
 * Порядок не алфавитный и не по дате: сначала те, куда вообще пускают.
 * Владельца с неоплаченной второй мойкой нельзя высаживать на стену,
 * когда рядом работает первая. Внутри — по последнему заходу: человек
 * возвращается туда, где вчера работал.
 *
 * Отключённые участия не показываются вовсе: уволенному на одной точке
 * незачем видеть её в списке.
 */
export async function listPoints(accountId: string): Promise<Point[]> {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      role: users.role,
      membershipId: users.id,
      lastUsedAt: users.lastUsedAt,
      createdAt: tenants.createdAt,
      plan: tenants.plan,
      trialEndsAt: tenants.trialEndsAt,
      paidUntil: tenants.paidUntil,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(users.accountId, accountId), eq(users.active, true)));

  return rows
    .map((r) => {
      const access = currentAccess(r);
      return {
        id: r.id,
        name: r.name,
        role: r.role === 'owner' ? ('owner' as const) : ('staff' as const),
        membershipId: r.membershipId,
        state: access.state,
        canRead: access.canRead,
        daysLeft: access.daysLeft,
        lastUsedAt: r.lastUsedAt,
        createdAt: r.createdAt,
      };
    })
    .sort((a, b) => {
      if (a.canRead !== b.canRead) return a.canRead ? -1 : 1;
      const at = a.lastUsedAt?.getTime() ?? 0;
      const bt = b.lastUsedAt?.getTime() ?? 0;
      if (at !== bt) return bt - at;
      return a.createdAt.getTime() - b.createdAt.getTime();
    })
    .map((r) => ({
      id: r.id,
      name: r.name,
      role: r.role,
      membershipId: r.membershipId,
      state: r.state,
      canRead: r.canRead,
      daysLeft: r.daysLeft,
    }));
}

/**
 * Куда вести человека при входе.
 *
 * Тот же порядок, что в переключателе, и это не совпадение, а условие:
 * разойдись они — список показывал бы одно, а вход открывал другое.
 *
 * Само по себе «взять первую строку users по телефону» перестало быть
 * ответом в тот момент, когда телефон перестал быть уникальным. Без
 * индекса порядок строк определяет их физическое расположение, а его
 * меняет любая правка: человек, переключившийся вчера на вторую мойку,
 * сегодня входил бы в первую.
 */
export async function pointForLogin(accountId: string): Promise<Point | undefined> {
  const points = await listPoints(accountId);
  return points[0];
}

/** Отметить, что человек только что работал здесь. */
export async function markPointUsed(membershipId: string): Promise<void> {
  await db.update(users).set({ lastUsedAt: new Date() }).where(eq(users.id, membershipId));
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
export async function claimAccount(input: {
  phone: string;
  pinHash: string;
  /**
   * Доказан ли номер.
   *
   * Ставится ровно там, где регистрация прошла через код из SMS. Никакой
   * вызывающий не имеет права передать сюда true «за компанию»: значение
   * этого поля решает, можно ли потом восстановить доступ по SMS, то
   * есть отдать аккаунт предъявителю номера.
   */
  phoneVerified?: boolean;
}): Promise<Account> {
  const [created] = await db
    .insert(accounts)
    .values({
      phone: input.phone,
      pinHash: input.pinHash,
      phoneVerifiedAt: input.phoneVerified ? new Date() : null,
    })
    .onConflictDoNothing({ target: accounts.phone })
    .returning();

  if (!created) throw new PhoneTakenError();
  return created;
}

/** Отметить, что номер человека доказан кодом из SMS. */
export async function markPhoneVerified(accountId: string): Promise<void> {
  await db
    .update(accounts)
    .set({ phoneVerifiedAt: new Date() })
    .where(eq(accounts.id, accountId));
}
