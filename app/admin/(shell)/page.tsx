import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { attentionList, platformStats } from '@/lib/admin-queries';
import { paymentTotals } from '@/lib/admin-billing';
import { listTenantsForAdmin } from '@/lib/queries';
import { billingEnabled } from '@/lib/subscription';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { STATE_TONE } from '@/components/admin/format';
import { MiniBars } from '@/components/admin/mini-bars';

/**
 * Обзор платформы: сколько бизнесов, кто живой, где деньги, кому звонить.
 * Числа платформы, а не клиента: выручка моек здесь не складывается,
 * это их деньги, а не наши.
 */
export default async function AdminDashboard() {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();

  const [stats, totals, list] = await Promise.all([platformStats(), paymentTotals(), listTenantsForAdmin()]);
  const attention = attentionList(list).slice(0, 12);
  const money = (n: number) => formatMoney(n, 'AMD', 'ru');
  const conversion = stats.everTrial > 0 ? Math.round((stats.everPaid / stats.everTrial) * 100) : 0;
  const churn = stats.everPaid > 0 ? Math.round((stats.churned / stats.everPaid) * 100) : 0;

  return (
    <>
      <PageHeader className="mb-0" title={a.dashboard.title} description={a.dashboard.lead} />

      {!billingEnabled() && (
        <p role="status" className="rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning-soft-foreground">
          {a.dashboard.billingOff} <code className="num">BILLING_ENABLED=1</code>.
        </p>
      )}

      <MetricStrip columns={6}>
        <Metric label={a.dashboard.businesses} value={String(stats.businesses)} hint={`${a.state.trial}: ${stats.byState.trial} · ${a.state.active}: ${stats.byState.active}`} />
        <Metric label={a.dashboard.activeBusinesses} value={String(stats.activeWeek)} hint={a.dashboard.activeNote} tone={stats.activeWeek > 0 ? 'success' : 'muted'} />
        <Metric label={a.dashboard.users} value={String(stats.people)} />
        <Metric label={a.dashboard.carsToday} value={String(stats.carsToday)} hint={`${a.dashboard.carsWeek}: ${stats.carsWeek}`} />
        <Metric label={a.dashboard.mrr} value={money(totals.month)} hint={a.dashboard.mrrNote(money(totals.prevMonth))} />
        <Metric label={a.dashboard.conversion} value={`${conversion}%`} hint={a.dashboard.conversionNote(stats.everPaid, stats.everTrial)} />
      </MetricStrip>

      <MetricStrip columns={6}>
        <Metric size="sm" label={a.state.trial} value={String(stats.byState.trial)} tone="primary" />
        <Metric size="sm" label={a.state.active} value={String(stats.byState.active)} tone="success" />
        <Metric size="sm" label={a.state.unpaid} value={String(stats.byState.unpaid)} tone={stats.byState.unpaid ? 'warning' : 'muted'} />
        <Metric size="sm" label={a.state.expired} value={String(stats.byState.expired)} tone={stats.byState.expired ? 'destructive' : 'muted'} />
        <Metric size="sm" label={a.state.blocked} value={String(stats.byState.blocked)} tone="muted" />
        <Metric size="sm" label={a.dashboard.churn} value={`${churn}%`} hint={a.dashboard.churnNote} />
      </MetricStrip>

      <PanelGrid>
        <Panel className="lg:col-span-6" title={a.dashboard.signups} description={a.dashboard.signupsNote}>
          <MiniBars data={stats.signups.map((s) => ({ label: s.week.slice(5), value: s.count }))} />
        </Panel>
        <Panel className="lg:col-span-6" title={a.dashboard.usage} description={a.dashboard.usageNote}>
          <MiniBars data={stats.carsByDay.map((d) => ({ label: d.day.slice(8), value: d.count }))} />
        </Panel>

        <Panel
          className="lg:col-span-12"
          title={a.dashboard.attention}
          description={a.dashboard.attentionNote}
          count={attention.length || undefined}
          padded={false}
          actions={
            <Link href="/admin/businesses?state=attention" className="text-xs font-medium text-primary hover:underline">
              {a.common.open}
            </Link>
          }
        >
          {attention.length === 0 ? (
            <EmptyState compact title={a.dashboard.allGood} />
          ) : (
            <ul className="divide-y divide-border">
              {attention.map(({ t, access }) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm">
                  <Link href={`/admin/businesses/${t.id}`} className="min-w-40 font-medium hover:underline">
                    {t.name}
                  </Link>
                  <span className="text-muted-foreground">{t.ownerName ?? '—'}</span>
                  <a href={`tel:${t.ownerPhone ?? ''}`} className="num text-muted-foreground hover:text-foreground">
                    {t.ownerPhone ? formatPhone(t.ownerPhone) : '—'}
                  </a>
                  <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="num">
                      {t.orderCount === 0
                        ? a.dashboard.noOrders
                        : access.state === 'expired'
                          ? a.dashboard.expired
                          : access.state === 'trial' && (t.idleDays ?? 0) >= 2
                            ? a.dashboard.idleTrial(t.idleDays ?? 0)
                            : a.dashboard.expiresIn(access.daysLeft)}
                    </span>
                    <StatusBadge tone={STATE_TONE[access.state]}>{a.state[access.state]}</StatusBadge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </PanelGrid>
    </>
  );
}
