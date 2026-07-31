import { and, eq, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './db';
import { shifts, tenants, users } from './db/schema';
import { startOfDay } from './queries';
import { notifyOwnersInBackground } from './push';

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

  /* Уведомляем только на самом деле новую смену. Повторное нажатие
     возвращается выше, и владелец не получает второе «вышел на смену»
     о том же человеке. */
  const [who] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  notifyOwnersInBackground(tenantId, userId, {
    title: 'Հերթափոխ',
    body: `${who?.name ?? 'Աշխատակից'} դուրս եկավ հերթափոխի`,
    thread: 'shift',
  });

  return row;
}

export async function closeShift(tenantId: string, userId: string) {
  await db
    .update(shifts)
    .set({ closedAt: new Date() })
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.userId, userId), isNull(shifts.closedAt)));
}

/** Во сколько по местному времени смены закрываются сами. */
export const CLOSING_HOUR = 20;

/**
 * Вечернее закрытие.
 *
 * Переключатель выключать забывают — смена кончилась, телефон убрали. До
 * сих пор такая смена висела до следующего утра, и всю ночь у владельца
 * горела зелёная точка, будто на мойке кто-то есть.
 *
 * Закрываем в 20:00 по времени бизнеса, а не сервера: он в Германии, а
 * мойка в Ереване — разница четыре часа, и «вечер» у них разный.
 *
 * Закрываем временем 20:00, а не моментом запуска: задача ходит раз в
 * час, и приписывать человеку лишние минуты только потому, что она
 * сработала в 20:07, неправильно.
 *
 * Смены, начатые ПОСЛЕ 20:00, не трогаем — это ночная работа, а не
 * забытый переключатель. Их подберёт `closeForgotten` на следующий день.
 */
export async function closeEvening(now = new Date()) {
  const open = await db
    .select({
      shiftId: shifts.id,
      tenantId: shifts.tenantId,
      userId: shifts.userId,
      name: users.name,
      timezone: tenants.timezone,
      openedAt: shifts.openedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(tenants, eq(tenants.id, shifts.tenantId))
    .where(isNull(shifts.closedAt));

  const byTenant = new Map<string, { at: Date; names: string[]; ids: string[] }>();

  for (const row of open) {
    const closing = new Date(startOfDay(row.timezone, now).getTime() + CLOSING_HOUR * 3_600_000);
    if (now < closing) continue;
    if (row.openedAt >= closing) continue;

    const bucket = byTenant.get(row.tenantId) ?? { at: closing, names: [], ids: [] };
    bucket.names.push(row.name);
    bucket.ids.push(row.shiftId);
    byTenant.set(row.tenantId, bucket);
  }

  for (const [tenantId, bucket] of byTenant) {
    await db.update(shifts).set({ closedAt: bucket.at }).where(inArray(shifts.id, bucket.ids));

    /* Одно уведомление на бизнес, а не на человека: три закрытых смены —
       это одно событие вечера, а не три новости. */
    notifyOwnersInBackground(tenantId, null, {
      title: 'Հերթափոխը փակվեց',
      body: bucket.names.join(', '),
      thread: 'shift',
    });
  }

  return {
    tenants: byTenant.size,
    shifts: [...byTenant.values()].reduce((n, b) => n + b.ids.length, 0),
  };
}

/**
 * Кто стоял на смене в этот день — для истории.
 *
 * Берём все смены, пересекающиеся с сутками, а не только открытые в них:
 * смена может начаться до полуночи и кончиться после, и выкинуть её
 * значило бы показать день, в котором на мойке не было никого, хотя
 * машины в нём записаны.
 */
export async function shiftsOnDay(tenantId: string, from: Date, to: Date) {
  return db
    .select({
      userId: shifts.userId,
      name: users.name,
      openedAt: shifts.openedAt,
      closedAt: shifts.closedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .where(
      and(
        eq(shifts.tenantId, tenantId),
        lt(shifts.openedAt, to),
        or(isNull(shifts.closedAt), gt(shifts.closedAt, from)),
      ),
    )
    .orderBy(sql`${shifts.openedAt} asc`);
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
