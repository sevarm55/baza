import { desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenses } from '@/lib/db/schema';
import { getPeriodCosts, shareOfPeriod } from '@/lib/expenses';
import { getPeriodStats, getServiceBreakdown } from '@/lib/queries';
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
