import { and, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './db';
import { orders, shifts, tenants, users } from './db/schema';
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

/**
 * Сколько наличных намыл человек за отрезок смены.
 *
 * Только наличные: карта и перевод уходят мимо рук, сдавать их не нужно.
 * Списания с абонемента тоже не в счёт — деньги за него пришли раньше.
 */
export async function cashInShift(
  tenantId: string,
  userId: string,
  from: Date,
  to: Date,
): Promise<number> {
  const [row] = await db
    .select({
      cash: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} = 'cash'), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.staffId, userId),
        gte(orders.createdAt, from),
        lt(orders.createdAt, to),
        isNull(orders.canceledAt),
      ),
    );

  return row?.cash ?? 0;
}

/**
 * Уйти со смены и сдать наличные.
 *
 * `declared` необязателен: заставить отметить сумму — значит запереть
 * человека в приложении в конце смены, а закрыться он должен уметь
 * всегда. Не отметил — владелец увидит именно «не отмечено», а не ноль:
 * это разные вещи.
 */
export async function closeShift(tenantId: string, userId: string, declared?: number | null) {
  const [open] = await db
    .select()
    .from(shifts)
    .where(and(eq(shifts.tenantId, tenantId), eq(shifts.userId, userId), isNull(shifts.closedAt)));

  if (!open) return null;

  const at = new Date();
  const expected = await cashInShift(tenantId, userId, open.openedAt, at);

  await db
    .update(shifts)
    .set({
      closedAt: at,
      cashExpected: expected,
      cashDeclared: typeof declared === 'number' ? declared : null,
    })
    .where(eq(shifts.id, open.id));

  /* Владельцу сообщаем сразу и с цифрами: смысл сдачи в том, чтобы
     расхождение всплывало в тот же вечер, а не через месяц при сверке. */
  const [who] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  notifyOwnersInBackground(tenantId, userId, {
    title: 'Հերթափոխը փակվեց',
    body: cashLine(who?.name ?? '', expected, declared ?? null),
    thread: 'shift',
  });

  return { expected, declared: declared ?? null };
}

/** «Աշոտ · կանխիկ 45 000 ֏ · հանձնեց 43 000 ֏ · −2 000 ֏» */
function cashLine(name: string, expected: number, declared: number | null): string {
  const money = (n: number) => `${n.toLocaleString('ru-RU').replace(/ /g, ' ')} ֏`;
  if (expected === 0 && declared === null) return name;
  if (declared === null) return `${name} · կանխիկ ${money(expected)} · չի նշել`;

  const diff = declared - expected;
  const tail = diff === 0 ? '' : ` · ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`;
  return `${name} · կանխիկ ${money(expected)} · հանձնեց ${money(declared)}${tail}`;
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

  type Closing = {
    at: Date;
    rows: { shiftId: string; userId: string; name: string; openedAt: Date }[];
  };
  const byTenant = new Map<string, Closing>();

  for (const row of open) {
    const closing = new Date(startOfDay(row.timezone, now).getTime() + CLOSING_HOUR * 3_600_000);
    if (now < closing) continue;
    if (row.openedAt >= closing) continue;

    const bucket = byTenant.get(row.tenantId) ?? { at: closing, rows: [] };
    bucket.rows.push({
      shiftId: row.shiftId,
      userId: row.userId,
      name: row.name,
      openedAt: row.openedAt,
    });
    byTenant.set(row.tenantId, bucket);
  }

  for (const [tenantId, bucket] of byTenant) {
    /* Ожидаемую наличность считаем и здесь. Человек не отметил, сколько
       сдал, — но сколько он намыл наличными, владелец знать должен:
       иначе автозакрытая смена превращается в дыру в кассовой сверке. */
    const lines: string[] = [];
    for (const row of bucket.rows) {
      const expected = await cashInShift(tenantId, row.userId, row.openedAt, bucket.at);
      await db
        .update(shifts)
        .set({ closedAt: bucket.at, cashExpected: expected })
        .where(eq(shifts.id, row.shiftId));
      lines.push(cashLine(row.name, expected, null));
    }

    /* Одно уведомление на бизнес, а не на человека: три закрытых смены —
       это одно событие вечера, а не три новости. */
    notifyOwnersInBackground(tenantId, null, {
      title: 'Հերթափոխը փակվեց',
      body: lines.join('\n'),
      thread: 'shift',
    });
  }

  return {
    tenants: byTenant.size,
    shifts: [...byTenant.values()].reduce((n, b) => n + b.rows.length, 0),
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
      cashExpected: shifts.cashExpected,
      cashDeclared: shifts.cashDeclared,
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
    /* Уволенных не показываем даже с открытой сменой: их смены теперь
       закрываются при увольнении, но старые данные остались, и зелёная
       точка у человека без доступа — худшее, что может показать этот
       список. */
    .where(and(eq(shifts.tenantId, tenantId), isNull(shifts.closedAt), eq(users.active, true)))
    .orderBy(sql`${shifts.openedAt} asc`);
}
