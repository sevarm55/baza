import { ensureDb } from '@/lib/db/ready';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  startOfDay,
  startOfDaysAgo,
} from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
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

    /* Периоды выровнены по суткам: «7 дней» — это семь календарных дней,
       включая сегодняшний, а не 168 часов назад от текущей минуты.
       Так понятнее человеку и, главное, так постоянные расходы можно
       начислять целыми днями. */
    const from = byHour
      ? startOfDay(ctx.tenant.timezone)
      : startOfDaysAgo(ctx.tenant.timezone, Number(period) - 1);

    /* Верхняя граница — начало завтрашнего дня. Записей в будущем не
       бывает, поэтому на выручку это не влияет, зато аренда за сегодня
       начисляется целым днём.

       Иначе она копилась по часам, и прибыль за сегодня уменьшалась сама
       по себе просто оттого, что идёт время: посмотрел в обед — одно
       число, вечером без единой новой машины — другое. */
    const to = new Date(startOfDay(ctx.tenant.timezone).getTime() + 86_400_000);

    /* Кто на смене — всегда «сейчас», независимо от выбранного периода:
       вопрос «кто на мойке» к семи дням отношения не имеет. Поэтому
       считаем от начала сегодняшнего дня, а не от `from`. */
    const today = startOfDay(ctx.tenant.timezone);

    const [stats, series, split, feed, costs, present] = await Promise.all([
      getPeriodStats(ctx.tenant.id, from, to),
      getRevenueSeries(ctx.tenant.id, from, ctx.tenant.timezone, byHour ? 'hour' : 'day'),
      getPaymentSplit(ctx.tenant.id, from),
      getFeed(ctx.tenant.id, from),
      getPeriodCosts(ctx.tenant.id, from, to),
      whoIsOnShift(ctx.tenant.id, today),
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
