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
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { Avatar, Hero } from '@/components/stat';
import { DayChart, PaymentSplit, type ChartPoint } from '@/components/day-chart';
import { CancelOrderButton } from '@/components/cancel-order-button';
import { getPeriod } from './periods';
import { PeriodTabs } from './period-tabs';

/* Через переменные, а не хексами: в светлой теме те же оттенки темнеют,
   иначе полоса на белом фоне выцветает до неразличимости. */
const PAYMENT_COLORS: Record<string, string> = {
  cash: 'var(--good)',
  card: 'var(--accent-strong)',
  transfer: 'var(--accent2)',
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
  const byHour = period.key === 'today';

  const from = byHour
    ? startOfDay(tenant.timezone)
    : new Date(Date.now() - Number(period.key) * 86_400_000);

  const [stats, feed, series, split] = await Promise.all([
    getPeriodStats(tenant.id, from),
    getFeed(tenant.id, from),
    getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day'),
    getPaymentSplit(tenant.id, from),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  const maxRevenue = Math.max(1, ...stats.byStaff.map((s) => s.revenue));
  const points = buildPoints(series, byHour, Number(period.key));

  return (
    <>
      <PeriodTabs current={period.key} />

      <Hero
        label={hy.owner.revenue}
        value={money(stats.revenue)}
        meta={
          <>
            {stats.count} {tenant.unitOne} · {hy.owner.avgCheck} {money(stats.avgCheck)}
            {passesEnabled() && stats.passSales > 0 && (
              <>
                {' · '}
                {hy.passes.revenue} {money(stats.passSales)}
              </>
            )}
          </>
        }
      />

      <DayChart
        points={points}
        currency={tenant.currency}
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
        {stats.byStaff.length === 0 ? (
          <Empty text={hy.common.empty} />
        ) : (
          stats.byStaff.map((s) => (
            <div key={s.staffId ?? 'none'} className="li">
              <Avatar text={s.name ?? '—'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{s.name ?? '—'}</div>
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
                <div className="num text-xs text-muted">
                  {hy.owner.earned} {money(s.earned)}
                </div>
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
                  {o.serviceName} · {o.staffName ?? '—'} · {paymentLabel(o.payment)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="num text-[14.5px] font-semibold">{money(o.price)}</div>
                <div className="num text-xs text-muted">{hhmm(o.createdAt)}</div>
              </div>
              <CancelOrderButton orderId={o.id} />
            </div>
          ))
        )}
      </div>
    </>
  );
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
  days: number,
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

  const points: ChartPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 00`;
    points.push({ label: pad(d.getDate()), value: found.get(key) ?? 0 });
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
