import { ensureDb } from '@/lib/db/ready';
import { getPeriodStats, getRevenueSeries, startOfDay } from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { isMonth, localDate, monthBounds } from '@/lib/history';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Месяц для календаря.
 *
 * Отдаём по дню на строку — выручку и число машин. Этого хватает, чтобы
 * нарисовать сетку, в которой сразу видно, где месяц был густым: цифры в
 * клетку не влезают, а высота столбика читается мгновенно.
 *
 * Подробности дня приходят отдельным запросом, когда на день нажали.
 * Тянуть их для всех тридцати сразу — это тридцать лент записей ради
 * одной, которую откроют.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const zone = ctx.tenant.timezone;
    const asked = new URL(request.url).searchParams.get('month') ?? '';
    // без месяца — текущий, в зоне бизнеса, а не сервера
    const month = isMonth(asked) ? asked : localDate(zone).slice(0, 7);

    const { from, to, days } = monthBounds(month, zone);

    /* Аренда начисляется по прошедшие дни включительно, а не за месяц
       вперёд: в середине месяца полная сумма показала бы убыток, которого
       ещё нет. Прошедшие месяцы это не трогает — там граница уже позади. */
    const tomorrow = new Date(startOfDay(zone).getTime() + 86_400_000);
    const costsTo = to < tomorrow ? to : tomorrow;

    const [series, stats, costs] = await Promise.all([
      getRevenueSeries(ctx.tenant.id, from, zone, 'day'),
      getPeriodStats(ctx.tenant.id, from, to),
      /* Знаменатель для постоянных расходов — длина ЭТОГО месяца, а не
         средняя 30.4375. Со средней календарь и сводка показывали за один
         и тот же август разную прибыль: средняя делит аренду на меньшее
         число дней и снимает лишние полпроцента в сутки. */
      getPeriodCosts(ctx.tenant.id, from, costsTo, days),
    ]);

    /* Ряд приходит только за дни, в которые что-то было. Дополняем
       пустыми: календарь рисует сетку по числу дней месяца, и дырки в
       середине превратились бы в сдвиг чисел. */
    const found = new Map(series.map((p) => [p.key.slice(0, 10), p]));
    const daily = Array.from({ length: days }, (_, i) => {
      const date = `${month}-${String(i + 1).padStart(2, '0')}`;
      const point = found.get(date);
      return { date, revenue: point?.revenue ?? 0, count: point?.count ?? 0 };
    });

    return ok({
      month,
      days: daily,
      total: {
        revenue: stats.revenue,
        // столбики рисуются по оплаченному на месте: абонемент продан один
        // раз, и размазывать его по дням использования нельзя
        serviceRevenue: stats.serviceRevenue,
        count: stats.count,
        payroll: stats.payroll,
        expenses: costs.total,
        profit: profitOf(stats.revenue, stats.payroll, costs),
      },
    });
  } catch (e) {
    return failFromError(e);
  }
}

