import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenses, orderShares, orders, shifts, users } from '@/lib/db/schema';
import { getPeriodCosts, shareOfPeriod } from '@/lib/expenses';
import { getPaymentSplit, getPeriodStats, getRevenueSeries, getServiceBreakdown } from '@/lib/queries';
import type { ReportRange } from '@/lib/report-range';
import { daysInMonthOf, startOfDay, startOfMonth } from '@/lib/time';

/** Один месяц в отчёте: всё, из чего складывается «осталось». */
export type ReportMonth = {
  /** первое число месяца в поясе бизнеса */
  from: Date;
  to: Date;
  count: number;
  revenue: number;
  payroll: number;
  costs: number;
  /** разовые траты месяца: из чего сложились расходы */
  oneOff: number;
  /** доля постоянных, пришедшаяся на месяц */
  monthlyShare: number;
  avgCheck: number;
  /**
   * Скидок дано за месяц.
   *
   * Не расход и не убыток: это деньги, которых бизнес решил не брать.
   * Считает `getPeriodStats` тем же запросом, что выручку, — второй
   * счёт скидок разошёлся бы с ней на первой же отменённой записи.
   */
  discounts: number;
  profit: number;
  /** доля, которая осталась владельцу, в процентах */
  kept: number;
  /**
   * Кто это сделал.
   *
   * Приезжает вместе с месяцем, а не отдельным запросом: `getPeriodStats`
   * считает разбивку по людям в том же вызове, которым получена выручка,
   * и спрашивать её второй раз ради открытого месяца значило бы сделать
   * лишний запрос за уже посчитанным.
   */
  /**
   * Кто это сделал — той же формой, что и на сводке.
   *
   * `revenue` здесь не для экрана: кабинет рисует по нему только имя и
   * заработок. Он есть потому, что разбивка по людям — одно понятие
   * продукта, и отдавать её из двух мест в двух разных формах значит
   * заставлять клиентов держать два типа под одно и то же. Приложение на
   * этом уже споткнулось: экран отчёта падал на разборе ответа, потому
   * что тип, годный для сводки, не подходил к отчёту.
   */
  byStaff: {
    staffId: string | null;
    name: string | null;
    count: number;
    revenue: number;
    earned: number;
  }[];
};

/**
 * Месяцы подряд, по одной строке на каждый.
 *
 * Кабинет умеет показывать текущий месяц и прошлый — и всё. Вопрос
 * «лучше или хуже стало за полгода» задают чаще, чем «сколько сегодня»,
 * а ответить на него было нечем: приходилось переключать период и
 * запоминать числа глазами.
 *
 * Каждый месяц считается теми же функциями, что и сводка: отчёт не имеет
 * права считать по-своему, иначе два экрана продукта разойдутся в
 * цифрах, и владелец не будет верить ни одному.
 */
export async function getMonthlyReport(
  tenantId: string,
  timezone: string,
  months = 6,
  now = new Date(),
): Promise<ReportMonth[]> {
  /* Границы месяцев считаем шагом назад от текущего: складывать по
     тридцать дней нельзя — февраль и март разъедутся с календарём. */
  /* Верхняя граница текущего месяца — начало ЗАВТРАШНИХ суток, а не
     текущая минута.

     Ровно так же считает сводка (`windowFor`), и совпадать они обязаны:
     расход, заведённый сегодня в обед, попадал в «этот месяц» на сводке
     и не попадал в отчёт, если открыть его утром следующего дня по
     часам сервера. Два экрана одного продукта показывали разные расходы
     за один и тот же месяц — а это ровно то, из-за чего перестают
     верить обоим. */
  const tomorrow = new Date(startOfDay(timezone, now).getTime() + 86_400_000);

  const bounds: { from: Date; to: Date }[] = [];
  let edge = new Date(now.getTime());
  for (let i = 0; i < months; i++) {
    const from = startOfMonth(timezone, edge);
    const to = i === 0 ? tomorrow : bounds[i - 1].from;
    bounds.push({ from, to });
    edge = new Date(from.getTime() - 1);
  }

  return Promise.all(
    bounds.map(async ({ from, to }) => {
      const [stats, costs] = await Promise.all([
        getPeriodStats(tenantId, from, to),
        getPeriodCosts(tenantId, from, to, daysInMonthOf(timezone, from)),
      ]);

      const profit = stats.revenue - stats.payroll - costs.total;
      return {
        from,
        to,
        count: stats.count,
        revenue: stats.revenue,
        payroll: stats.payroll,
        costs: costs.total,
        discounts: stats.discounts,
        oneOff: costs.oneOff,
        monthlyShare: costs.monthlyShare,
        avgCheck: stats.avgCheck,
        profit,
        kept: stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0,
        byStaff: stats.byStaff.map((s) => ({
          staffId: s.staffId,
          name: s.name,
          count: s.count,
          revenue: s.revenue,
          earned: s.earned,
        })),
      };
    }),
  );
}

/** С чем сравнивают месяц: тот же по длине отрезок предыдущего. */
export type ReportBase = {
  from: Date;
  to: Date;
  count: number;
  revenue: number;
  profit: number;
};

/**
 * Сопоставимый предыдущий отрезок.
 *
 * Вопрос «лучше или хуже стало» требует базы, и база обязана быть
 * честной. Сравнивать пятнадцатое августа с целым июлем нельзя: в
 * середине месяца это всегда даёт «минус пятьдесят процентов» — число
 * про то, какое сегодня число, а не про дела.
 *
 * Поэтому предыдущий месяц режется по прожитому времени: пятнадцать
 * дней августа сравниваются с пятнадцатью днями июля. У закрытого
 * месяца прожито всё, и режется он по началу собственного месяца —
 * то есть берётся предыдущий целиком, какой бы длины он ни был.
 *
 * То же правило уже работает на сводке (`windowFor`), и это не
 * совпадение: два экрана продукта, отвечающие «лучше или хуже» по
 * разным правилам, не сравнимы между собой.
 */
export async function getMonthBase(
  tenantId: string,
  timezone: string,
  month: { from: Date; to: Date },
): Promise<ReportBase | null> {
  const from = startOfMonth(timezone, new Date(month.from.getTime() - 1));
  const lived = month.to.getTime() - month.from.getTime();
  const to = new Date(Math.min(from.getTime() + lived, month.from.getTime()));

  const [stats, costs] = await Promise.all([
    getPeriodStats(tenantId, from, to),
    getPeriodCosts(tenantId, from, to, daysInMonthOf(timezone, from)),
  ]);

  /* Пустой предыдущий месяц — не база, а её отсутствие. «+100%» к нулю
     не сообщает ничего, кроме того, что раньше мойка не работала. */
  if (stats.count === 0) return null;

  return {
    from,
    to,
    count: stats.count,
    revenue: stats.revenue,
    profit: stats.revenue - stats.payroll - costs.total,
  };
}

/** Строка разбивки: на что ушли деньги. */
export type CostLine = { category: string; amount: number; monthly: boolean };

/**
 * Куда ушли деньги за период — по названиям, а не по одной сумме.
 *
 * «Ծախսեր 150 000» отвечает «сколько», но не «на что», а решение
 * принимают именно по второму: аренду не подвинешь, а на химии, которая
 * внезапно стоит как аренда, экономить можно уже завтра.
 *
 * Постоянные считаются долей за прожитые дни, разовые — целиком: то же
 * правило, что и на странице расходов, и та же формула. Двум экранам
 * нельзя расходиться в том, что такое «потрачено».
 */
export async function getCostsByCategory(
  tenantId: string,
  from: Date,
  to: Date,
  spread: number,
): Promise<CostLine[]> {
  /* Тем же выражением, что итог периода и строки списка расходов. Здесь
     стояла его третья копия, и разъехаться ей было достаточно одного
     исправления в любой из двух других: разбивка перестала бы сходиться
     с числом, которое она объясняет. */
  const share = shareOfPeriod(from.toISOString(), to.toISOString(), spread);

  const rows = await db
    .select({
      category: expenses.category,
      monthly: expenses.monthly,
      amount: sql<number>`coalesce(sum(${share}), 0)::int`,
    })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId))
    .groupBy(expenses.category, expenses.monthly)
    .orderBy(desc(sql`3`));

  /* Нули не показываем: расход, заведённый в другом месяце и в этот не
     попавший, — не строка отчёта, а шум в списке. */
  return rows.filter((r) => r.amount > 0);
}

/** Строка разбивки: откуда пришли деньги. */
export type EarnLine = { name: string; count: number; revenue: number };

/**
 * Откуда пришли деньги — по услугам.
 *
 * Считаем ПО СТРОКАМ записи (`order_items`), а не по её названию.
 *
 * Раньше группировали по `orders.service_name`, и пока услуга в записи
 * была одна, это работало. С появлением нескольких услуг за заезд
 * название стало составным — «Комплекс + Химчистка», — и разрез начал
 * показывать его отдельной услугой: в отчёте появлялись строки, которых
 * нет в прейскуранте, а настоящие услуги теряли свои деньги. Заметить
 * это по экрану почти невозможно: строка выглядит как обычная услуга,
 * просто с длинным именем.
 *
 * Название берём из самой строки, а не из прейскуранта: услугу могли
 * удалить, а деньги, которые она принесла, остаются деньгами. Отчёт за
 * прошлый год не должен зависеть от того, что владелец правил прайс
 * вчера.
 *
 * Считаем по прайсовой цене строки, а не по взятой: скидка живёт на
 * счёте целиком, и разносить её по услугам пришлось бы наугад. Владельцу
 * здесь важно другое — что чаще заказывают и что дороже стоит; сколько
 * скидок он дал, названо отдельным числом.
 */
export async function getEarnedByService(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<EarnLine[]> {
  const rows = await getServiceBreakdown(tenantId, from, to);
  return rows.map((r) => ({ name: r.name, count: r.count, revenue: r.revenue }));
}

/* ═══════════════════════ аналитика за отрезок ═══════════════════════ */

const notCanceled = isNull(orders.canceledAt);

/** Итоги отрезка: то же, из чего сложена сводка, плюс база сравнения. */
export type RangeSummary = {
  count: number;
  revenue: number;
  payroll: number;
  costs: number;
  oneOff: number;
  monthlyShare: number;
  profit: number;
  avgCheck: number;
  discounts: number;
  passSales: number;
  /** процент от выручки */
  payrollShare: number;
  costsShare: number;
  kept: number;
  byStaff: ReportMonth['byStaff'];
};

export async function getRangeSummary(
  tenantId: string,
  from: Date,
  to: Date,
  spread: number,
): Promise<RangeSummary> {
  const [stats, costs] = await Promise.all([
    getPeriodStats(tenantId, from, to),
    getPeriodCosts(tenantId, from, to, spread),
  ]);
  const profit = stats.revenue - stats.payroll - costs.total;
  const pct = (n: number) => (stats.revenue > 0 ? Math.round((n / stats.revenue) * 1000) / 10 : 0);
  return {
    count: stats.count,
    revenue: stats.revenue,
    payroll: stats.payroll,
    costs: costs.total,
    oneOff: costs.oneOff,
    monthlyShare: costs.monthlyShare,
    profit,
    avgCheck: stats.avgCheck,
    discounts: stats.discounts,
    passSales: stats.passSales,
    payrollShare: pct(stats.payroll),
    costsShare: pct(costs.total),
    kept: stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0,
    byStaff: stats.byStaff,
  };
}

/** Точка ряда: час дня или день отрезка. */
export type SeriesPoint = {
  /** «2026-08-23 14» — тот же ключ, что отдаёт база */
  key: string;
  revenue: number;
  count: number;
  /** оплаченных на месте: по ним считается средний чек */
  paidCount: number;
  payroll: number;
  /** расходы дня: разовые целиком плюс доля постоянных; по часам не считаются */
  costs: number;
  net: number;
  avgCheck: number;
};

/**
 * Ряд по отрезку: деньги, машины, начисления и расходы по часам или дням.
 *
 * Выручка и машины из того же запроса, что рисует сводку; начисления
 * отдельно, по долям участников, потому что их группировка по времени
 * не сводится к записям. Расходы только по дням: постоянный расход не
 * имеет часа, а разовый в «14:00» ничего не объясняет.
 */
export async function getRangeSeries(
  tenantId: string,
  range: Pick<ReportRange, 'from' | 'to' | 'byHour' | 'spread' | 'days'>,
  timezone: string,
): Promise<SeriesPoint[]> {
  const bucket = range.byHour ? 'hour' : 'day';
  const local = sql`(${orders.createdAt} at time zone ${timezone})`;

  const [money, paid, earned, costLines] = await Promise.all([
    getRevenueSeries(tenantId, range.from, timezone, bucket, range.to),
    db
      .select({
        key: sql<string>`to_char(date_trunc(${bucket}, ${local}), 'YYYY-MM-DD HH24')`,
        paidCount: sql<number>`count(*) filter (where ${orders.payment} <> 'pass')::int`,
      })
      .from(orders)
      .where(
        and(
          eq(orders.tenantId, tenantId),
          gte(orders.createdAt, range.from),
          lt(orders.createdAt, range.to),
          notCanceled,
        ),
      )
      .groupBy(sql`1`),
    db
      .select({
        key: sql<string>`to_char(date_trunc(${bucket}, ${local}), 'YYYY-MM-DD HH24')`,
        payroll: sql<number>`coalesce(sum(${orderShares.earned}), 0)::int`,
      })
      .from(orderShares)
      .innerJoin(orders, eq(orders.id, orderShares.orderId))
      .where(
        and(
          eq(orders.tenantId, tenantId),
          gte(orders.createdAt, range.from),
          lt(orders.createdAt, range.to),
          notCanceled,
        ),
      )
      .groupBy(sql`1`),
    range.byHour ? Promise.resolve([]) : costsByDay(tenantId, range, timezone),
  ]);

  const paidBy = new Map(paid.map((p) => [p.key, p.paidCount]));
  const earnedBy = new Map(earned.map((e) => [e.key, e.payroll]));
  const costBy = new Map(costLines.map((c) => [c.key, c.amount]));

  const keys = new Set<string>([...money.map((m) => m.key), ...earnedBy.keys(), ...costBy.keys()]);
  const points: SeriesPoint[] = [];
  for (const key of keys) {
    const m = money.find((x) => x.key === key);
    const revenue = m?.revenue ?? 0;
    const count = m?.count ?? 0;
    const paidCount = paidBy.get(key) ?? 0;
    const payroll = earnedBy.get(key) ?? 0;
    const costs = costBy.get(key) ?? 0;
    points.push({
      key,
      revenue,
      count,
      paidCount,
      payroll,
      costs,
      net: revenue - payroll - costs,
      avgCheck: paidCount > 0 ? Math.round(revenue / paidCount) : 0,
    });
  }
  return points.sort((a, b) => (a.key < b.key ? -1 : 1));
}

/**
 * Расходы по дням: разовые в свой день, постоянные долей за каждый
 * прожитый день. Доля та же, что и в итогах (`amount / spread`), иначе
 * сумма столбиков не сошлась бы с показанием наверху.
 */
async function costsByDay(
  tenantId: string,
  range: Pick<ReportRange, 'from' | 'to' | 'spread'>,
  timezone: string,
): Promise<{ key: string; amount: number }[]> {
  const rows = await db
    .select({
      amount: expenses.amount,
      monthly: expenses.monthly,
      at: expenses.at,
      endedAt: expenses.endedAt,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        lt(expenses.at, range.to),
        sql`(${expenses.endedAt} is null or ${expenses.endedAt} > ${range.from.toISOString()}::timestamptz)`,
      ),
    );

  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const by = new Map<string, number>();
  const add = (day: string, n: number) => by.set(day, (by.get(day) ?? 0) + n);

  for (const r of rows) {
    if (!r.monthly) {
      if (r.at >= range.from && r.at < range.to) add(`${ymd.format(r.at)} 00`, r.amount);
      continue;
    }
    /* Постоянный: по дню за каждые сутки, когда он действовал. */
    const perDay = r.amount / range.spread;
    for (let t = range.from.getTime(); t < range.to.getTime(); t += 86_400_000) {
      const day = new Date(t);
      const next = new Date(t + 86_400_000);
      if (r.at >= next) continue;
      if (r.endedAt && r.endedAt <= day) continue;
      add(`${ymd.format(day)} 00`, Math.round(perDay));
    }
  }
  return [...by.entries()].map(([key, amount]) => ({ key, amount }));
}

/** Клетка тепловой карты: день недели × час. */
export type HeatCell = { dow: number; hour: number; count: number; revenue: number };

/**
 * Загрузка по времени: в какие часы каких дней приезжают.
 *
 * День недели ISO (1 понедельник … 7 воскресенье) и час в поясе
 * бизнеса: у мойки в Ереване «восемь утра» это восемь по Еревану, а не
 * по серверу.
 */
export async function getHeatmap(
  tenantId: string,
  from: Date,
  to: Date,
  timezone: string,
): Promise<HeatCell[]> {
  const local = sql`(${orders.createdAt} at time zone ${timezone})`;
  return db
    .select({
      dow: sql<number>`extract(isodow from ${local})::int`,
      hour: sql<number>`extract(hour from ${local})::int`,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
    })
    .from(orders)
    .where(
      and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), lt(orders.createdAt, to), notCanceled),
    )
    .groupBy(sql`1`, sql`2`);
}

/** Строка команды за отрезок. */
export type StaffLine = {
  staffId: string | null;
  name: string | null;
  /** в скольких машинах участвовал */
  count: number;
  /** выручка машин, в которых участвовал */
  revenue: number;
  earned: number;
  avgCheck: number;
  shifts: number;
  /** часов на смене, с одним знаком */
  hours: number;
  /** средний процент по начисленному */
  percent: number;
};

/**
 * Люди: сколько машин, сколько принесли, сколько начислено, сколько смен.
 *
 * Не рейтинг ради рейтинга: таблица отвечает «кто что сделал», и
 * сортируется по начисленному, потому что это число и есть зарплата.
 */
export async function getStaffPerformance(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<StaffLine[]> {
  const [work, rest] = await Promise.all([
    db
      .select({
        staffId: orderShares.staffId,
        name: users.name,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
        paid: sql<number>`count(*) filter (where ${orders.payment} <> 'pass')::int`,
        earned: sql<number>`coalesce(sum(${orderShares.earned}), 0)::int`,
      })
      .from(orderShares)
      .innerJoin(orders, eq(orders.id, orderShares.orderId))
      .leftJoin(users, eq(users.id, orderShares.staffId))
      .where(
        and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), lt(orders.createdAt, to), notCanceled),
      )
      .groupBy(orderShares.staffId, users.name),
    db
      .select({
        userId: shifts.userId,
        shifts: sql<number>`count(*)::int`,
        hours: sql<number>`coalesce(sum(extract(epoch from (coalesce(${shifts.closedAt}, now()) - ${shifts.openedAt}))), 0) / 3600.0`,
      })
      .from(shifts)
      .where(and(eq(shifts.tenantId, tenantId), gte(shifts.openedAt, from), lt(shifts.openedAt, to)))
      .groupBy(shifts.userId),
  ]);

  const shiftBy = new Map(rest.map((r) => [r.userId, r]));
  return work
    .map((w) => {
      const sh = w.staffId ? shiftBy.get(w.staffId) : undefined;
      return {
        staffId: w.staffId,
        name: w.name,
        count: w.count,
        revenue: w.revenue,
        earned: w.earned,
        avgCheck: w.paid > 0 ? Math.round(w.revenue / w.paid) : 0,
        shifts: sh?.shifts ?? 0,
        hours: sh ? Math.round(Number(sh.hours) * 10) / 10 : 0,
        percent: w.revenue > 0 ? Math.round((w.earned / w.revenue) * 100) : 0,
      };
    })
    .sort((a, b) => b.earned - a.earned);
}

/** Способы оплаты за отрезок: уже с долями. */
export async function getPaymentMix(tenantId: string, from: Date, to: Date) {
  const rows = await getPaymentSplit(tenantId, from, to);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return rows
    .filter((r) => r.revenue > 0 || r.count > 0)
    .map((r) => ({
      payment: r.payment,
      revenue: r.revenue,
      count: r.count,
      share: total > 0 ? Math.round((r.revenue / total) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);
}

/** Сумма рядов нескольких точек по ключу: для режима «все филиалы». */
export function mergeSeries(lists: SeriesPoint[][]): SeriesPoint[] {
  const by = new Map<string, SeriesPoint>();
  for (const list of lists) {
    for (const p of list) {
      const cur = by.get(p.key);
      if (!cur) {
        by.set(p.key, { ...p });
        continue;
      }
      cur.revenue += p.revenue;
      cur.count += p.count;
      cur.paidCount += p.paidCount;
      cur.payroll += p.payroll;
      cur.costs += p.costs;
      cur.net += p.net;
      cur.avgCheck = cur.paidCount > 0 ? Math.round(cur.revenue / cur.paidCount) : 0;
    }
  }
  return [...by.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
}

/** Сумма итогов нескольких точек. */
export function mergeSummaries(list: RangeSummary[]): RangeSummary {
  const sum = (k: keyof RangeSummary) => list.reduce((s, x) => s + (x[k] as number), 0);
  const revenue = sum('revenue');
  const payroll = sum('payroll');
  const costs = sum('costs');
  const profit = revenue - payroll - costs;
  const count = sum('count');
  /* Средний чек взвешенный: сумма выручек на сумму оплаченных машин. У
     каждой точки avgCheck = revenue/paid, paid = revenue/avgCheck. */
  const paid = list.reduce((s, x) => s + (x.avgCheck > 0 ? x.revenue / x.avgCheck : 0), 0);
  const pct = (n: number) => (revenue > 0 ? Math.round((n / revenue) * 1000) / 10 : 0);
  return {
    count,
    revenue,
    payroll,
    costs,
    oneOff: sum('oneOff'),
    monthlyShare: sum('monthlyShare'),
    profit,
    avgCheck: paid > 0 ? Math.round(revenue / paid) : 0,
    discounts: sum('discounts'),
    passSales: sum('passSales'),
    payrollShare: pct(payroll),
    costsShare: pct(costs),
    kept: revenue > 0 ? Math.round((profit / revenue) * 100) : 0,
    byStaff: list.flatMap((x) => x.byStaff),
  };
}

