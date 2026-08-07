import { ensureDb } from '@/lib/db/ready';
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

/** Ключ ряда так, как его строит Postgres: «2026-07-31 16». */
function keyOf(at: Date, timezone: string, byHour: boolean): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  const hour = byHour ? (get('hour') === '24' ? '00' : get('hour')) : '00';
  return `${get('year')}-${get('month')}-${get('day')} ${hour}`;
}

/**
 * Дополнить ряд пустыми промежутками.
 *
 * Postgres возвращает только те часы, в которые что-то было. На графике
 * они вставали вплотную, и пятичасовой простой между 11 и 16 исчезал —
 * день выглядел сплошь загруженным. Пустой столбик — тоже факт, и
 * зачастую более важный, чем полный.
 *
 * Для дня начинаем с первого часа, когда появилась первая машина: сутки
 * с полуночи — это шестнадцать пустых столбиков перед единственным
 * полным, и рельеф в них теряется.
 */
export function padSeries(
  points: { key: string; revenue: number; count: number }[],
  byHour: boolean,
  timezone: string,
  from: Date,
  to: Date,
  /* Момент «сейчас» параметром, а не через Date.now() внутри: иначе
     проверить эту функцию можно только в удачный час. Проверка, которая
     зависит от того, когда её запустили, однажды покраснеет ночью и
     научит не верить всему набору. */
  now: Date = new Date(),
) {
  if (points.length === 0) return points;

  const known = new Map(points.map((p) => [p.key, p]));
  const step = byHour ? 3_600_000 : 86_400_000;
  const last = Math.min(to.getTime(), now.getTime());

  /* Идём по моментам времени и переводим каждый в местный ключ — так же,
     как это делает Postgres. Разбирать готовый ключ обратно нельзя: он
     местный, и превращение его в момент времени сдвигает всё на часовой
     пояс. */
  const out: typeof points = [];
  for (let t = from.getTime(); t <= last && out.length < 400; t += step) {
    const key = keyOf(new Date(t), timezone, byHour);
    out.push(known.get(key) ?? { key, revenue: 0, count: 0 });
  }

  /* У дня срезаем пустое начало: сутки с полуночи — это шестнадцать
     пустых столбиков перед первой машиной, и рельеф в них теряется.
     Пустоту ВНУТРИ дня оставляем — она и есть простой. */
  if (!byHour) return out;
  const firstWorked = out.findIndex((p) => p.revenue > 0);
  return firstWorked <= 0 ? out : out.slice(firstWorked);
}
