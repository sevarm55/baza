import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  getTenant,
  startOfDay,
} from '@/lib/queries';
import { windowFor } from '@/lib/summary-window';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { Profit } from '@/components/profit';
import { Avatar, Hero } from '@/components/stat';
import { Compare } from '@/components/compare';
import { DayChart, PaymentSplit, type ChartPoint } from '@/components/day-chart';
import { CancelOrderButton } from '@/components/cancel-order-button';
import { personColor } from '@/lib/person-color';
import { getPeriod } from './periods';
import { PeriodTabs } from './period-tabs';

/* Через переменные, а не хексами: в светлой теме те же оттенки темнеют,
   иначе полоса на белом фоне выцветает до неразличимости.

   Перевод берёт не сам лайм, а --accent2-ink: чистый лайм по белой
   плитке даёт 1.06, и точка в легенде исчезла бы. В светлой теме это
   приглушённая олива, в тёмной — тот же лайм. */
const PAYMENT_COLORS: Record<string, string> = {
  cash: 'var(--good)',
  card: 'var(--accent-strong)',
  transfer: 'var(--accent2-ink)',
  pass: 'var(--warn)',
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { p } = await searchParams;
  const period = getPeriod(p);

  /* Границы и база сравнения считаются там же, где для приложения: у сайта
     и телефона должны быть одни и те же деньги за один и тот же день. */
  const w = windowFor(period.key, tenant.timezone);
  const { byHour, from, to, prevFrom, prevTo } = w;

  const [stats, feed, series, split, costs, prevStats, prevCosts] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    // лента ограничена сверху: у «прошлого месяца» она не должна
    // прихватывать записи из текущего
    getFeed(tenant.id, from, 100, to),
    getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day', to),
    getPaymentSplit(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, to, w.spread),
    getPeriodStats(tenant.id, prevFrom, prevTo),
    getPeriodCosts(tenant.id, prevFrom, prevTo, w.spread),
  ]);

  /* Кто на смене — всегда «сейчас», независимо от выбранного периода:
     вопрос «кто на мойке» к семи дням отношения не имеет.

     Список объединяем, а не показываем два: человек, который встал час
     назад и ещё ничего не намыл, в byStaff не попадает вовсе — по записям
     его не видно, а на площадке он стоит. */
  const present = await whoIsOnShift(tenant.id, startOfDay(tenant.timezone));
  const presentIds = new Set(present.map((p) => p.userId));

  const crew = [
    ...present.map((p) => {
      const worked = stats.byStaff.find((s) => s.staffId === p.userId);
      return {
        staffId: p.userId,
        name: p.name,
        present: true,
        count: worked?.count ?? 0,
        revenue: worked?.revenue ?? 0,
        earned: worked?.earned ?? 0,
      };
    }),
    ...stats.byStaff
      .filter((s) => !s.staffId || !presentIds.has(s.staffId))
      .map((s) => ({
        staffId: s.staffId,
        name: s.name,
        present: false,
        count: s.count,
        revenue: s.revenue,
        earned: s.earned,
      })),
  ];

  const money = (n: number) => formatMoney(n, tenant.currency);
  const profit = profitOf(stats.revenue, stats.payroll, costs);
  const prevProfit = profitOf(prevStats.revenue, prevStats.payroll, prevCosts);
  const maxRevenue = Math.max(1, ...stats.byStaff.map((s) => s.revenue));
  const points = buildPoints(series, byHour, from, w.days, tenant.timezone);

  return (
    <>
      <PeriodTabs current={period.key} />

      <Hero
        label={
          period.key === 'today'
            ? hy.owner.revenueToday
            : period.key === 'month'
              ? hy.owner.revenueMonth
              : hy.owner.revenuePrevMonth
        }
        value={money(stats.revenue)}
        meta={
          <>
            {/* Дата обязательна: сутки считаются по времени бизнеса и в
                полночь начинаются заново. Без неё владелец, открывший
                кабинет в половине первого, видит ноль и решает, что
                данные пропали. */}
            {periodDates(from, to, tenant.timezone, byHour)} · {stats.count} {tenant.unitOne} ·{' '}
            {hy.owner.avgCheck} {money(stats.avgCheck)}
            {passesEnabled() && stats.passSales > 0 && (
              <>
                {' · '}
                {hy.passes.revenue} {money(stats.passSales)}
              </>
            )}
          </>
        }
      />

      <Compare
        label={
          period.key === 'today'
            ? hy.owner.vsLastWeek
            : periodDates(prevFrom, prevTo, tenant.timezone, false)
        }
        base={prevProfit}
        diff={profit - prevProfit}
        baseCount={prevStats.count}
        money={money}
      />

      <Profit
        revenue={stats.revenue}
        payroll={stats.payroll}
        oneOff={costs.oneOff}
        monthlyShare={costs.monthlyShare}
        profit={profit}
        daily={period.key === 'today'}
        money={money}
      />

      <DayChart
        points={points}
        currency={tenant.currency}
        byHour={byHour}
        labelEvery={byHour ? 3 : points.length > 14 ? 5 : 1}
      />

      <PaymentSplit
        currency={tenant.currency}
        segments={split
          // абонементы спрятаны — не показываем их и в разбивке
          .filter((s) => passesEnabled() || s.payment !== 'pass')
          .map((s) => ({
            label: paymentLabel(s.payment),
            value: s.revenue,
            color: PAYMENT_COLORS[s.payment] ?? 'var(--muted)',
          }))}
      />

      <h2 className="h-section">{hy.owner.onShift}</h2>
      <div className="list">
        {crew.length === 0 ? (
          <Empty text={hy.common.empty} />
        ) : (
          crew.map((s) => (
            <div key={s.staffId ?? 'none'} className="li">
              <Avatar text={s.name ?? '—'} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {/* зелёная точка — «стоит на мойке прямо сейчас», а не
                      «работал сегодня»: человек мог встать час назад и
                      ещё ничего не намыть */}
                  {s.present && (
                    <span
                      className="size-2 shrink-0 rounded-full bg-good"
                      aria-label={hy.owner.onShiftNow}
                    />
                  )}
                  <span
                    className="truncate text-[14.5px] font-semibold"
                    style={{ color: personColor(s.name) }}
                  >
                    {s.name ?? '—'}
                  </span>
                </div>
                <div className="num text-[12.5px] text-muted">
                  {s.count} {tenant.unitOne}
                </div>
                <div className="mt-[7px] h-1.5 overflow-hidden rounded-full bg-surface2">
                  <div
                    className="h-full rounded-full bg-accent-strong"
                    style={{ width: `${Math.round((s.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-[14.5px] font-semibold">{money(s.revenue)}</div>
                {/* Ноль не показываем: у владельца ставки нет, и «ему 0 ֏»
                    рядом с его выработкой — шум, а не сведение. */}
                {s.earned > 0 && (
                  <div className="num text-xs text-muted">
                    {hy.owner.earned} {money(s.earned)}
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <h2 className="h-section">{hy.owner.feed}</h2>
      <div className="list">
        {feed.length === 0 ? (
          <Empty text={hy.common.empty} />
        ) : (
          feed.map((o) => (
            <div key={o.id} className="li">
              <div className="min-w-0 flex-1">
                <div className="num truncate text-[14.5px] font-semibold">
                  {o.clientKey ?? '—'}
                </div>
                <div className="truncate text-[12.5px] text-muted">
                  {/* имя цветом человека — «это помыл вот этот» читается
                      по цвету, без вчитывания в строку */}
                  <span className="font-semibold" style={{ color: personColor(o.staffName) }}>
                    {o.staffName ?? '—'}
                  </span>{' '}
                  · {o.serviceName} · {paymentLabel(o.payment)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-[14.5px] font-semibold">{money(o.price)}</div>
                {/* Сколько с этой машины ушло исполнителю. Владелец видит
                    цену и тут же — свою долю от неё, не считая в уме и не
                    уходя в зарплатную ведомость. Процент — снимок записи,
                    поэтому вчерашние строки не меняются от новой ставки.

                    При нулевом проценте строка не показывается: у владельца,
                    который записывает сам, ставки нет, и «ему 0 ֏» под каждой
                    его записью — шум, а не сведение. */}
                {o.staffPercent > 0 && (
                  <div className="num text-xs text-muted">
                    {hy.owner.earned} {money(staffShare(o.price, o.staffPercent))}
                  </div>
                )}
                <div className="num text-xs text-faint">{hhmm(o.createdAt)}</div>
              </div>
              <CancelOrderButton orderId={o.id} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

/**
 * «1 օգոստոսի» или «1 — 7 օգոստոսի».
 *
 * Верхняя граница берётся из окна, а не из «сегодня»: у прошлого месяца
 * период закончился, и подписывать его сегодняшним числом — врать.
 */
function periodDates(from: Date, to: Date, timezone: string, single: boolean): string {
  const f = new Intl.DateTimeFormat('hy-AM', { day: 'numeric', month: 'long', timeZone: timezone });
  if (single) return f.format(from);

  // верхняя граница — начало следующих суток, поэтому день назад
  const last = new Date(Math.min(to.getTime(), Date.now()) - 1);
  const day = new Intl.DateTimeFormat('hy-AM', { day: 'numeric', timeZone: timezone });
  const sameMonth =
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(from) ===
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(last);

  // «1 — 7 օգոստոսի» вместо «1 օգոստոսի — 7 օգոստոսի»: месяц один, и
  // повторять его дважды значит забрать место у цифр
  return sameMonth ? `${day.format(from)} — ${f.format(last)}` : `${f.format(from)} — ${f.format(last)}`;
}

function Empty({ text }: { text: string }) {
  return <div className="px-4 py-12 text-center text-sm text-faint">{text}</div>;
}

/**
 * Достраиваем пустые часы и дни.
 *
 * Без этого график врёт: три записи подряд в 9, 14 и 19 нарисуются
 * тремя соседними столбиками, и провала между ними не будет видно —
 * а он и есть самое интересное.
 */
function buildPoints(
  series: { key: string; revenue: number }[],
  byHour: boolean,
  from: Date,
  days: number,
  timezone: string,
): ChartPoint[] {
  const found = new Map(series.map((s) => [s.key, s.revenue]));

  if (byHour) {
    const hours = series.map((s) => Number(s.key.slice(11, 13)));
    if (hours.length === 0) return [];
    const day = series[0].key.slice(0, 10);
    const start = Math.min(...hours);
    const end = Math.max(...hours);
    const points: ChartPoint[] = [];
    for (let h = start; h <= end; h++) {
      const key = `${day} ${String(h).padStart(2, '0')}`;
      points.push({ label: String(h).padStart(2, '0'), value: found.get(key) ?? 0 });
    }
    return points;
  }

  /* Идём ВПЕРЁД от начала периода, а не назад от «сейчас». Пока все
     периоды заканчивались сегодняшним днём, разницы не было; с закрытым
     прошлым месяцем отсчёт от текущей минуты рисовал чужие дни.

     Ключ собирается в часовом поясе бизнеса, потому что база группирует
     именно по нему. Собранный в зоне сервера, он совпадал бы только пока
     сервер и мойка стоят в одном поясе. */
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const points: ChartPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const iso = ymd.format(d);
    points.push({ label: iso.slice(8, 10), value: found.get(`${iso} 00`) ?? 0 });
  }
  return points;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}

function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
