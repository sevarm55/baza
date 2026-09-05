import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { accounts, loginAttempts, tenants, users, type Account } from './db/schema';
import { checkLogin, noteLogin } from './login-guard';
import { verifyPassword } from './password';

/**
 * Удаление бизнеса.
 *
 * Одна строка в `tenants` тянет за собой всё: сотрудников, услуги,
 * клиентов, записи, абонементы, выплаты, сессии и журнал. Так устроена
 * схема — `ON DELETE CASCADE` стоит на каждой таблице, и перечислять их
 * здесь руками не нужно. Это важнее, чем кажется: список таблиц растёт,
 * и написанный от руки он однажды отстанет, оставив в базе сирот с
 * чужими данными.
 *
 * Отдельного удаления аккаунта сотрудника нет и не планируется: его
 * заводит и отключает владелец, своей учётной записью работник не
 * распоряжается. Здесь он исчезает вместе с бизнесом.
 *
 * Что каскад не заберёт — попытки входа: они привязаны к телефону, а не
 * к бизнесу, потому что копятся ещё до того, как аккаунт существует.
 * Их нужно убрать явно, иначе выйдет ловушка: владелец несколько раз
 * промахнулся PIN-ом, удалил бизнес, регистрируется тем же номером
 * заново — и упирается в блокировку от аккаунта, которого больше нет.
 */
/* ------------------- чем подтверждают удаление ------------------- */

/**
 * Удаление бизнеса подтверждают дважды разными вещами, и вторая зависит
 * от того, что у человека вообще есть.
 *
 * Первая — живая сессия. Её мало: телефон лежит на мойке
 * разблокированным, и между «зашёл посмотреть выручку» и «стёр всё»
 * обязано стоять что-то, чего случайный человек рядом не знает.
 *
 * Вторая — PIN. Но у заведённых по SMS его нет вовсе: `pin_hash` у них
 * помечен «кода нет», и `verifyPin` отказывает всегда. Пока подтверждение
 * было только одно, такой владелец не мог удалить свой бизнес НИКОГДА —
 * ни с сайта, ни с телефона. Выход сложнее входа, а данные заперты у нас;
 * ни то ни другое не должно существовать.
 *
 * Поэтому у второго подтверждения два вида, и выбирает не клиент, а
 * состояние аккаунта: есть код — спрашиваем код, нет — высылаем SMS на
 * тот самый номер, которым человек и входит. Присланный клиентом признак
 * «у меня нет PIN» здесь был бы способом обойти PIN, поэтому решает
 * только `hasPin` по базе.
 */
/**
 * Проверить подтверждение удаления.
 *
 * Подтверждается ПАРОЛЕМ — тем же, чем человек входит. Раньше здесь были
 * два пути: PIN, если он заведён, и код из SMS, если нет. Кодов из SMS у
 * продукта больше нет вовсе (оператор перестал пропускать буквенного
 * отправителя, см. `lib/auth-password.ts`), а PIN перестал быть входом.
 * Осталось одно, и это к лучшему: два способа подтвердить необратимое
 * действие — два места, где можно ошибиться.
 *
 * Счётчик попыток тот же, что на входе, и это не перестраховка: без него
 * форма удаления становится тихим способом подобрать пароль владельца
 * изнутри уже открытой сессии — без блокировки и без следа в истории
 * входов.
 */
export type DeleteProof =
  | { ok: true }
  | { ok: false; problem: 'WRONG_PASSWORD' }
  | { ok: false; problem: 'THROTTLED'; retryAfter: number };

export async function checkDeleteProof(input: {
  account: Pick<Account, 'id' | 'phone' | 'email' | 'passwordHash'>;
  ip: string | null;
  password?: string;
}): Promise<DeleteProof> {
  /* Ключ счётчика — то, чем человек входит. У владельца это почта; на
     телефон опираемся только у тех, кто заведён до перехода. */
  const key = input.account.email ?? input.account.phone;

  const guard = await checkLogin(key, input.ip);
  if (!guard.allowed) return { ok: false, problem: 'THROTTLED', retryAfter: guard.retryAfter };

  const password = String(input.password ?? '');
  const good =
    password && input.account.passwordHash
      ? await verifyPassword(password, input.account.passwordHash)
      : false;

  await noteLogin(key, input.ip, good);
  return good ? { ok: true } : { ok: false, problem: 'WRONG_PASSWORD' };
}

export async function deleteBusiness(tenantId: string): Promise<{ people: number }> {
  return db.transaction(async (tx) => {
    const staff = await tx
      .select({ phone: users.phone, accountId: users.accountId })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const accountIds = [...new Set(staff.map((s) => s.accountId).filter(Boolean))] as string[];
    let phones: string[] = [];

    await tx.delete(tenants).where(eq(tenants.id, tenantId));

    /* Человек переживает бизнес — но только если ему есть где остаться.
       Тот, у кого не осталось ни одного участия, уходит вместе с
       последним: иначе его номер числился бы занятым навсегда, а
       завестись заново стало бы нечем. Именно этим номер и
       освобождается.

       У кого осталась вторая мойка — остаётся и он сам, со своим кодом,
       своими устройствами и своим израсходованным пробным сроком.
       Удаление одной точки не имеет права выкидывать человека из
       другой. */
    if (accountIds.length > 0) {
      const left = await tx
        .select({ accountId: users.accountId })
        .from(users)
        .where(inArray(users.accountId, accountIds));

      const staying = new Set(left.map((r) => r.accountId));
      const gone = accountIds.filter((id) => !staying.has(id));
      if (gone.length > 0) {
        const leaving = await tx
          .select({ phone: accounts.phone })
          .from(accounts)
          .where(inArray(accounts.id, gone));
        phones = leaving.map((r) => r.phone);
        await tx.delete(accounts).where(inArray(accounts.id, gone));
      }
    }

    /* Только у тех, кто ушёл совсем. У кого осталась вторая мойка,
       счётчик неудачных входов трогать нельзя: обнулять его удалением
       соседней точки значило бы дать способ снимать защиту от перебора
       с собственного номера. */
    if (phones.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.phone, phones));
    }

    /* Считаем участия, а не ушедших совсем: в логе интересно, сколько
       человек лишились этой мойки, а не сколько из них попрощались с
       продуктом целиком. */
    return { people: staff.length };
  });
}
