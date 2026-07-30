import { ensureDb } from '@/lib/db/ready';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  startOfDay,
} from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Сводка владельца за период — весь экран одним запросом.
 *
 * В вебе это четыре независимых запроса, и там это правильно: они уходят
 * параллельно внутри одного рендера. Приложению так нельзя — четыре
 * round-trip по мобильной сети складываются в заметную паузу, а часть из
 * них ещё и оборвётся.
 *
 * Период задаётся теми же ключами, что и вкладки в кабинете: today, 7, 30.
 * Чужое или пустое значение молча читается как «сегодня».
 */
const PERIODS = new Set(['today', '7', '30']);

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const raw = new URL(request.url).searchParams.get('period') ?? 'today';
    const period = PERIODS.has(raw) ? raw : 'today';
    const byHour = period === 'today';

    const from = byHour
      ? startOfDay(ctx.tenant.timezone)
      : new Date(Date.now() - Number(period) * 86_400_000);

    const [stats, series, split, feed, costs] = await Promise.all([
      getPeriodStats(ctx.tenant.id, from),
      getRevenueSeries(ctx.tenant.id, from, ctx.tenant.timezone, byHour ? 'hour' : 'day'),
      getPaymentSplit(ctx.tenant.id, from),
      getFeed(ctx.tenant.id, from),
      getPeriodCosts(ctx.tenant.id, from),
    ]);

    return ok({
      period,
      from: from.toISOString(),
      stats,
      costs,
      /* Прибыль считаем на сервере, а не в приложении: формула одна на
         все клиенты, и разъехаться между телефоном и кабинетом она не
         должна — это та цифра, из-за которой продукту верят. */
      profit: profitOf(stats.revenue, stats.payroll, costs),
      series,
      split,
      feed: feed.map((o) => ({
        id: o.id,
        clientKey: o.clientKey,
        serviceName: o.serviceName,
        staffName: o.staffName,
        price: o.price,
        payment: o.payment,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
