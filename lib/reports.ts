import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { expenses } from '@/lib/db/schema';
import { getPeriodCosts } from '@/lib/expenses';
import { getPeriodStats } from '@/lib/queries';
import { daysInMonthOf, startOfMonth } from '@/lib/time';

/** Один месяц в отчёте: всё, из чего складывается «осталось». */
export type ReportMonth = {
  /** первое число месяца в поясе бизнеса */
  from: Date;
  to: Date;
  count: number;
  revenue: number;
  payroll: number;
  costs: number;
  profit: number;
  /** доля, которая осталась владельцу, в процентах */
  kept: number;
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
  const bounds: { from: Date; to: Date }[] = [];
  let edge = new Date(now.getTime());
  for (let i = 0; i < months; i++) {
    const from = startOfMonth(timezone, edge);
    const to = i === 0 ? now : bounds[i - 1].from;
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
        profit,
        kept: stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0,
      };
    }),
  );
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
  const fromAt = from.toISOString();
  const toAt = to.toISOString();

  const rows = await db
    .select({
      category: expenses.category,
      monthly: expenses.monthly,
      amount: sql<number>`coalesce(round(sum(
        case when ${expenses.monthly} then
          ${expenses.amount} * greatest(0, extract(epoch from (
            least(coalesce(${expenses.endedAt}, ${toAt}::timestamptz), ${toAt}::timestamptz)
            - greatest(${expenses.at}, ${fromAt}::timestamptz)
          )) / 86400.0) / ${spread}::numeric
        else
          case
            when ${expenses.at} >= ${fromAt}::timestamptz
             and ${expenses.at} < ${toAt}::timestamptz
            then ${expenses.amount}
            else 0
          end
        end
      )), 0)::int`,
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
 * Считаем по названию, записанному в самой записи, а не по ссылке на
 * прейскурант: услугу могли удалить, а деньги, которые она принесла,
 * остаются деньгами. Отчёт за прошлый год не должен зависеть от того,
 * что владелец правил прайс вчера.
 */
export async function getEarnedByService(
  tenantId: string,
  from: Date,
  to: Date,
): Promise<EarnLine[]> {
  const { orders } = await import('@/lib/db/schema');

  const rows = await db
    .select({
      name: orders.serviceName,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        sql`${orders.createdAt} >= ${from.toISOString()}::timestamptz`,
        sql`${orders.createdAt} < ${to.toISOString()}::timestamptz`,
        sql`${orders.canceledAt} is null`,
      ),
    )
    .groupBy(orders.serviceName)
    .orderBy(desc(sql`3`));

  return rows;
}
