import { and, desc, eq, gt, gte, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './db';
import { recordActivitySafely } from './activity';
import { orders, shifts, tenants, users } from './db/schema';
import { startOfDay } from './queries';
import { notifyOwnersInBackground } from './push';
import { DEFAULT_LOCALE, dict } from './i18n';
import { formatMoney } from './money';

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

/**
 * Можно ли сейчас записывать работу.
 *
 * Машина, записанная вне смены, нигде не всплывает при закрытии: сдача
 * наличных считается по записям внутри смены, и такая запись просто не
 * попадает в неё. Деньги за неё работник уносит домой честным человеком,
 * а владелец недосчитывается и не понимает почему. Это та же дыра, что
 * была с забытым переключателем, только с другой стороны.
 *
 * Правило снаружи звучит просто: не встал на смену — не записываешь.
 * Внутри оно мягче на один случай. Телефон копит записи офлайн и досылает
 * их, когда появится связь, — и досылка может прийти уже после того, как
 * смена закрылась сама в восемь вечера. Отвергнуть их значило бы объявить
 * настоящую работу ошибкой, поэтому закрытая сегодня смена тоже считается
 * основанием. Интерфейс при этом кнопку всё равно не даст.
 */
export async function canRecord(
  tenantId: string,
  userId: string,
  dayStart: Date,
): Promise<boolean> {
  const [row] = await db
    .select({ id: shifts.id })
    .from(shifts)
    .where(
      and(
        eq(shifts.tenantId, tenantId),
        eq(shifts.userId, userId),
        or(isNull(shifts.closedAt), gte(shifts.openedAt, dayStart)),
      ),
    )
    .limit(1);

  return Boolean(row);
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
 * Смена, которую человек СЕГОДНЯ уже закрыл.
 *
 * Нужна ради одного вопроса на экране: «я ещё не выходил» и «я отработал
 * и закрылся» — это разные состояния, а выглядели они одинаково. Пока
 * продукт знал только «есть открытая смена или нет», вечером после
 * закрытия экран возвращался ровно в то, что человек видел утром, — и
 * читался как потерянный день.
 *
 * Требуем, чтобы смена и открылась сегодня. Забытую вчерашнюю
 * `closeForgotten` закрывает началом суток, и без этого условия она
 * притворилась бы сегодняшней сменой длиной в ноль минут.
 */
export async function closedShiftToday(tenantId: string, userId: string, dayStart: Date) {
  const [row] = await db
    .select({ openedAt: shifts.openedAt, closedAt: shifts.closedAt })
    .from(shifts)
    .where(
      and(
        eq(shifts.tenantId, tenantId),
        eq(shifts.userId, userId),
        gte(shifts.openedAt, dayStart),
        isNotNull(shifts.closedAt),
      ),
    )
    .orderBy(desc(shifts.closedAt))
    .limit(1);

  return row?.closedAt ? { openedAt: row.openedAt, closedAt: row.closedAt } : null;
}

/**
 * Встать на смену.
 *
 * Повторный вызов ничего не ломает и не создаёт вторую смену: у человека
 * может быть только одна открытая, это держит частичный уникальный индекс.
 * Важно не для аккуратности, а потому что кнопку жмут дважды, а запросы
 * приходят из очереди повторно.
 */
export async function openShift(
  tenantId: string,
  userId: string,
  dayStart: Date,
  /* Язык уведомления. Пуш собирает сервер, спросить человека негде —
     поэтому берём язык бизнеса (`tenants.locale`), а не интерфейса того,
     кто нажал кнопку. */
  locale: string = DEFAULT_LOCALE,
) {
  const open = await currentShift(tenantId, userId, dayStart);
  if (open) return open;

  const [row] = await db.insert(shifts).values({ tenantId, userId }).returning();

  /* Уведомляем только на самом деле новую смену. Повторное нажатие
     возвращается выше, и владелец не получает второе «вышел на смену»
     о том же человеке. */
  const [who] = await db.select({ name: users.name }).from(users).where(eq(users.id, userId));
  const t = dict(locale);
  notifyOwnersInBackground(tenantId, userId, {
    title: t.push.shiftTitle,
    body: t.push.shiftOpened(who?.name ?? t.push.someone),
    thread: 'shift',
  });

  await recordActivitySafely({
    tenantId,
    type: 'shift.started',
    actorId: userId,
    actorName: who?.name,
    entityId: row.id,
    at: row.openedAt,
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
export async function closeShift(
  tenantId: string,
  userId: string,
  declared?: number | null,
  locale: string = DEFAULT_LOCALE,
) {
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
  const t = dict(locale);
  notifyOwnersInBackground(tenantId, userId, {
    title: t.push.shiftClosedTitle,
    body: cashLine(who?.name ?? '', expected, declared ?? null, locale),
    thread: 'shift',
  });

  await recordActivitySafely({
    tenantId,
    type: 'shift.finished',
    actorId: userId,
    actorName: who?.name,
    entityId: open.id,
    at,
    data: {
      cashExpected: expected,
      cashDeclared: typeof declared === 'number' ? declared : null,
    },
  });

  return { expected, declared: declared ?? null };
}

/**
 * «Աշոտ · կանխիկ 45 000 ֏ · հանձնեց 43 000 ֏ · −2 000 ֏»
 *
 * Слова и разделитель разрядов идут за языком бизнеса, валюта — нет.
 * Мойка в Ереване считает драмы, на каком бы языке владелец ни читал
 * уведомление; язык интерфейса денег не меняет.
 *
 * Сумма собирается общим `formatMoney`, а не своим `toLocaleString`:
 * то же число тем же способом, что и на всех экранах продукта, — иначе
 * пуш и сводка расходятся в разрядах на одной и той же цифре.
 */
function cashLine(
  name: string,
  expected: number,
  declared: number | null,
  locale: string,
  currency = 'AMD',
): string {
  const t = dict(locale);
  const money = (n: number) => formatMoney(n, currency, locale);

  if (expected === 0 && declared === null) return name;
  if (declared === null) {
    return `${name} · ${t.push.cashExpected(money(expected))} · ${t.push.cashNotDeclared}`;
  }

  const diff = declared - expected;
  const tail = diff === 0 ? '' : ` · ${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`;
  return `${name} · ${t.push.cashExpected(money(expected))} · ${t.push.cashDeclared(money(declared))}${tail}`;
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
      locale: tenants.locale,
      currency: tenants.currency,
      openedAt: shifts.openedAt,
    })
    .from(shifts)
    .innerJoin(users, eq(users.id, shifts.userId))
    .innerJoin(tenants, eq(tenants.id, shifts.tenantId))
    .where(isNull(shifts.closedAt));

  type Closing = {
    at: Date;
    /* Язык и валюта у всех смен одного бизнеса одни и те же — берём их
       у первой строки и дальше подписываем ими всё уведомление. */
    locale: string;
    currency: string;
    rows: { shiftId: string; userId: string; name: string; openedAt: Date }[];
  };
  const byTenant = new Map<string, Closing>();

  for (const row of open) {
    const closing = new Date(startOfDay(row.timezone, now).getTime() + CLOSING_HOUR * 3_600_000);
    if (now < closing) continue;
    if (row.openedAt >= closing) continue;

    const bucket = byTenant.get(row.tenantId) ?? {
      at: closing,
      locale: row.locale,
      currency: row.currency,
      rows: [],
    };
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
      lines.push(cashLine(row.name, expected, null, bucket.locale, bucket.currency));
      /* Закрыла система, а не человек: в ленте это видно по роли. */
      await recordActivitySafely({
        tenantId,
        type: 'shift.finished',
        actorId: row.userId,
        actorName: row.name,
        actorRole: 'system',
        entityId: row.shiftId,
        at: bucket.at,
        data: { cashExpected: expected, cashDeclared: null },
      });
    }

    /* Одно уведомление на бизнес, а не на человека: три закрытых смены —
       это одно событие вечера, а не три новости. */
    notifyOwnersInBackground(tenantId, null, {
      title: dict(bucket.locale).push.shiftClosedTitle,
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
