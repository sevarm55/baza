import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { accounts, loginAttempts, tenants, users } from './db/schema';

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
export async function deleteBusiness(tenantId: string): Promise<{ people: number }> {
  return db.transaction(async (tx) => {
    const staff = await tx
      .select({ phone: users.phone, accountId: users.accountId })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const phones = staff.map((s) => s.phone);
    const accountIds = [...new Set(staff.map((s) => s.accountId).filter(Boolean))] as string[];

    await tx.delete(tenants).where(eq(tenants.id, tenantId));

    /* Человек переживает бизнес — но только если ему есть где остаться.
       Тот, у кого не осталось ни одного участия, уходит вместе с
       последним: иначе его номер числился бы занятым навсегда, а
       завестись заново стало бы нечем. Именно этим номер и
       освобождается. */
    if (accountIds.length > 0) {
      const left = await tx
        .select({ accountId: users.accountId })
        .from(users)
        .where(inArray(users.accountId, accountIds));

      const staying = new Set(left.map((r) => r.accountId));
      const gone = accountIds.filter((id) => !staying.has(id));
      if (gone.length > 0) {
        await tx.delete(accounts).where(inArray(accounts.id, gone));
      }
    }

    /* Номер уникален глобально (users_phone_uniq), так что здесь не
       может оказаться чужих попыток входа. */
    if (phones.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.phone, phones));
    }

    return { people: phones.length };
  });
}
