import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getFeed, getPeriodStats, getTenant, startOfDay } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Avatar, Stat, StatGrid } from '@/components/stat';
import { CancelOrderButton } from '@/components/cancel-order-button';

const PERIODS = [
  { key: 'today', label: hy.owner.periodToday },
  { key: '7', label: hy.owner.periodWeek },
  { key: '30', label: hy.owner.periodMonth },
] as const;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

  const { p } = await searchParams;
  const period = PERIODS.find((x) => x.key === p) ?? PERIODS[0];

  const from =
    period.key === 'today'
      ? startOfDay(tenant.timezone)
      : new Date(Date.now() - Number(period.key) * 86_400_000);

  const [stats, feed] = await Promise.all([
    getPeriodStats(tenant.id, from),
    getFeed(tenant.id, from),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  const maxRevenue = Math.max(1, ...stats.byStaff.map((s) => s.revenue));

  return (
    <>
      <div className="mb-3.5 flex gap-1.5">
        {PERIODS.map((x) => (
          <Link
            key={x.key}
            href={x.key === 'today' ? '/owner' : `/owner?p=${x.key}`}
            className={`rounded-[10px] px-3 py-1.5 text-[13px] ${
              x.key === period.key
                ? 'bg-surface2 font-semibold text-ink'
                : 'text-muted hover:text-ink'
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <StatGrid>
        <Stat label={hy.owner.revenue} value={money(stats.revenue)} tone="good" />
        <Stat label={tenant.unitOne} value={stats.count} />
        <Stat label={hy.owner.avgCheck} value={money(stats.avgCheck)} />
        <Stat label={hy.owner.cashShare} value={money(stats.cash)} />
        {stats.passSales > 0 && (
          <Stat label={hy.passes.revenue} value={money(stats.passSales)} />
        )}
        {stats.passUses > 0 && (
          <Stat label={hy.payment.pass} value={stats.passUses} tone="warn" />
        )}
      </StatGrid>

      <h2 className="h-section">{hy.owner.onShift}</h2>
      <div className="list">
        {stats.byStaff.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{hy.common.empty}</div>
        ) : (
          stats.byStaff.map((s) => (
            <div key={s.staffId ?? 'none'} className="li">
              <Avatar text={s.name ?? '—'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{s.name ?? '—'}</div>
                <div className="text-[12.5px] text-muted">
                  {s.count} {tenant.unitOne}
                </div>
                <div className="mt-[7px] h-1.5 overflow-hidden rounded bg-surface2">
                  <div
                    className="h-full bg-accent"
                    style={{ width: `${Math.round((s.revenue / maxRevenue) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[14.5px] font-semibold">{money(s.revenue)}</div>
                <div className="text-xs text-muted">
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
          <div className="px-4 py-10 text-center text-sm text-muted">{hy.common.empty}</div>
        ) : (
          feed.map((o) => (
            <div key={o.id} className="li">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{o.clientKey ?? '—'}</div>
                <div className="truncate text-[12.5px] text-muted">
                  {o.serviceName} · {o.staffName ?? '—'} · {paymentLabel(o.payment)}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-[14.5px] font-semibold">{money(o.price)}</div>
                <div className="text-xs text-muted">{hhmm(o.createdAt)}</div>
              </div>
              <CancelOrderButton orderId={o.id} />
            </div>
          ))
        )}
      </div>
    </>
  );
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return `🎟 ${hy.payment.pass}`;
  return hy.payment.transfer;
}

function hhmm(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
