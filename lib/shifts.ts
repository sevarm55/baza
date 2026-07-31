import { and, eq, isNull, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { shifts, users } from './db/schema';

/**
 * Открытая смена.
 *
 * Раньше «смена» была выборкой — записи сотрудника с начала дня. Этого
 * хватало для заработка и не хватало для вопроса владельца «кто сейчас на
 * мойке»: по записям видно только тех, кто уже успел что-то намыть, а
 * человек может стоять на площадке час и не намыть ничего.
 *
 * Открывает и закрывает сам работник переключателем у себя на экране.
 */

/**
 * Закрыть забытые смены.
 *
 * Переключатель выключать забывают — это не гипотеза, а норма: смена
 * кончилась, телефон убрали. Если такую смену не гасить, зелёная точка у
 * владельца будет гореть вечно и перестанет что-либо значить. Поэтому
 * всё, открытое до начала сегодняшнего дня, закрывается автоматически.
 *
 * Закрываем именно началом дня, а не «сейчас»: человек ушёл вчера, и
 * приписывать ему сегодняшние часы неправильно.
 */
async function closeForgotten(tenantId: string, dayStart: Date) {
  await db
    .update(shifts)
    .set({ closedAt: dayStart })
    .where(
      and(eq(shifts.tenantId, tenantId), isNull(shifts.closedAt), lt(shifts.openedAt, dayStart)),
    );
}

export async function currentShift(tenantId: string, userId: string, dayStart: Date) {
  await closeForgotten(tenantId, dayStart);

  const [row] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.userId, userId), isNull(shifts.closedAt)));

  return row ?? null;
}

/**
 * Встать на смену.
 *
 * Повторный вызов ничего не ломает и не создаёт вторую смену: у человека
 * может быть только одна открытая, это держит частичный уникальный индекс.
 * Важно не для аккуратности, а потому что кнопку жмут дважды, а запросы
 * приходят из очереди повторно.
 */
export async function openShift(tenantId: string, userId: string, dayStart: Date) {
  const open = await currentShift(tenantId, userId, dayStart);
  if (open) return open;

  const [row] = await db.insert(shifts).values({ tenantId, userId }).returning();
  return row;
}

export async function closeShift(tenantId: string, userId: string) {
  await db
    .update(shifts)
    .set({ closedAt: new Date() })
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.userId, userId), isNull(shifts.closedAt)));
}

/**
 * Кто сейчас на смене.
 *
 * Возвращает только тех, кто встал сам, — без цифр. Цифры у владельца уже
 * посчитаны в сводке по каждому исполнителю, и считать их второй раз
 * значило бы завести второй источник правды для одного и того же числа.
 */
export async function whoIsOnShift(tenantId: string, dayStart: Date) {
  await closeForgotten(tenantId, dayStart);

  return db
    .select({
      userId: shifts.userId,
      name: users.name,
      openedAt: shifts.openedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(and(eq(shifts.tenantId, tenantId), isNull(shifts.closedAt)))
    .orderBy(sql`${shifts.openedAt} asc`);
}
