import { ensureDb } from '@/lib/db/ready';
import { keyOf, padSeries } from '@/lib/series';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  startOfDay,
} from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';
import { asPeriod, windowFor } from '@/lib/summary-window';

/**
 * Сводка владельца за период — весь экран одним запросом.
 *
 * В вебе это четыре независимых запроса, и там это правильно: они уходят
 * параллельно внутри одного рендера. Приложению так нельзя — четыре
 * round-trip по мобильной сети складываются в заметную паузу, а часть из
 * них ещё и оборвётся.
 *
 * Период задаётся теми же ключами, что и вкладки в кабинете: today,
 * month, prevmonth. Чужое или пустое значение молча читается как «сегодня».
 * Границы и база сравнения считаются в `lib/summary-window.ts` — теми же,
 * что и в вебе, иначе сайт и приложение показали бы разные деньги за один
 * и тот же день.
 */

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const period = asPeriod(new URL(request.url).searchParams.get('period'));
    const w = windowFor(period, ctx.tenant.timezone);
    const { byHour, from, to, prevFrom, prevTo } = w;

    /* Кто на смене — всегда «сейчас», независимо от выбранного периода:
       вопрос «кто на мойке» к семи дням отношения не имеет. Поэтому
       считаем от начала сегодняшнего дня, а не от `from`. */
    const today = startOfDay(ctx.tenant.timezone);

    /* Число без опоры ничего не значит: «прибыль 11 144» — это хорошо
       или плохо? Владелец помнит вчерашнюю выручку, но не вчерашнюю
       прибыль, её никто в уме не считает. С чем именно сравнивать каждый
       период — решено в `windowFor`. */

    const [stats, series, split, feed, costs, present, prevStats, prevCosts] = await Promise.all([
      getPeriodStats(ctx.tenant.id, from, to),
      getRevenueSeries(ctx.tenant.id, from, ctx.tenant.timezone, byHour ? 'hour' : 'day', to),
      getPaymentSplit(ctx.tenant.id, from, to),
      getFeed(ctx.tenant.id, from),
      getPeriodCosts(ctx.tenant.id, from, to, w.spread),
      whoIsOnShift(ctx.tenant.id, today),
      getPeriodStats(ctx.tenant.id, prevFrom, prevTo),
      getPeriodCosts(ctx.tenant.id, prevFrom, prevTo, w.spread),
    ]);

    return ok({
      period,
      from: from.toISOString(),
      /* Границы отдаются обеими сторонами: подпись под вкладкой должна
         называть даты. «К прошлому периоду» без дат не сообщает ничего —
         человеку надо видеть, что сравнили 1–7 августа с 1–7 июля. */
      to: to.toISOString(),
      stats,
      costs,
      /* Прибыль считаем на сервере, а не в приложении: формула одна на
         все клиенты, и разъехаться между телефоном и кабинетом она не
         должна — это та цифра, из-за которой продукту верят. */
      profit: profitOf(stats.revenue, stats.payroll, costs),
      /* Прошлый отрезок — только две цифры: больше на экране всё равно не
         показать, а тащить целый второй набор ради этого незачем. */
      previous: {
        from: prevFrom.toISOString(),
        to: prevTo.toISOString(),
        revenue: prevStats.revenue,
        profit: profitOf(prevStats.revenue, prevStats.payroll, prevCosts),
        /* Пусто — значит сравнивать не с чем: бизнес завёлся на этой
           неделе, прошлого месяца у него не было. Клиент в этом случае
           молчит, а не рисует «+100%» от нуля. */
        count: prevStats.count,
      },
      onShift: present.map((p) => ({
        userId: p.userId,
        name: p.name,
        openedAt: p.openedAt,
      })),
      series: padSeries(series, byHour, ctx.tenant.timezone, from, to),
      split,
      feed: feed.map((o) => ({
        id: o.id,
        clientKey: o.clientKey,
        serviceName: o.serviceName,
        staffName: o.staffName,
        // снимок процента из самой записи: приложение считает долю
        // исполнителя по нему, а не по текущей ставке человека
        staffPercent: o.staffPercent,
        price: o.price,
        payment: o.payment,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

