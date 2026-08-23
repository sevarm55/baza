import Link from 'next/link';
import { notFound } from 'next/navigation';

import { logAdminAction, requireAdmin, roleAtLeast } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { getFeed, getOwner, getPeriodStats, getTenant, listStaff, otherPointsOf, startOfDay, startOfDaysAgo } from '@/lib/queries';
import { paymentsOf } from '@/lib/admin-billing';
import { tenantAdminAudit } from '@/lib/admin-queries';
import { listActivity } from '@/lib/activity';
import { activityPhrase } from '@/lib/activity-text';
import { accessOf } from '@/lib/subscription';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { NICHES, type NicheKey } from '@/lib/niches';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { getDict } from '@/lib/i18n/server';
import { hhmm } from '@/lib/time';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { Person } from '@/components/patterns/person';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_TONE, date, when, whenShort } from '@/components/admin/format';
import { TenantActions } from '@/components/admin/tenant-actions';

const TABS = ['overview', 'activity', 'audit', 'payments'] as const;
type Tab = (typeof TABS)[number];

/**
 * Карточка бизнеса: его цифры нашими глазами.
 *
 * Страница только читает. Войти под владельцем было бы удобнее ровно
 * один раз и опасно каждый следующий: любая случайная кнопка пишется
 * в чужие книги от его имени. Здесь писать нечем, кроме подписки,
 * заметки и выключателя: это про нас, а не про его мойку.
 *
 * Каждый заход попадает в журнал: мы смотрим в чужую выручку, и на
 * вопрос «кто открывал» должен быть ответ.
 */
export default async function BusinessPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const t = await getDict();

  const { id } = await params;
  const tenant = await getTenant(id);
  if (!tenant) notFound();
  const tab: Tab = (TABS as readonly string[]).includes((await searchParams).tab ?? '') ? ((await searchParams).tab as Tab) : 'overview';

  await logAdminAction({ by: ctx, action: 'tenant.view', targetType: 'tenant', targetId: tenant.id, targetLabel: tenant.name });

  const tz = tenant.timezone;
  const [today, week, month, staff, feed, payments, owner, activity, audit] = await Promise.all([
    getPeriodStats(tenant.id, startOfDay(tz)),
    getPeriodStats(tenant.id, startOfDaysAgo(tz, 6)),
    getPeriodStats(tenant.id, startOfDaysAgo(tz, 29)),
    listStaff(tenant.id),
    getFeed(tenant.id, startOfDaysAgo(tz, 29), 20),
    paymentsOf(tenant.id),
    getOwner(tenant.id),
    tab === 'activity' ? listActivity(tenant.id, { limit: 100 }) : Promise.resolve([]),
    tab === 'audit' ? tenantAdminAudit(tenant.id) : Promise.resolve([]),
  ]);

  const access = accessOf(tenant);
  const siblings = owner?.accountId ? await otherPointsOf(owner.accountId, tenant.id) : [];
  const money = (n: number) => formatMoney(n, tenant.currency, 'ru');
  const niche = NICHES[tenant.niche as NicheKey];
  const canAct = roleAtLeast(ctx.role, 'support');
  const href = (x: Tab) => (x === 'overview' ? `/admin/businesses/${tenant.id}` : `/admin/businesses/${tenant.id}?tab=${x}`);

  const periods = [
    { label: a.businesses.periods.today, st: today },
    { label: a.businesses.periods.week, st: week },
    { label: a.businesses.periods.month, st: month },
  ];

  return (
    <>
      <PageHeader
        className="mb-0"
        back={{ href: '/admin/businesses', label: a.businesses.back }}
        title={`${niche?.icon ?? ''} ${tenant.name}`.trim()}
        description={
          <>
            {owner?.name ?? '—'} ·{' '}
            {owner?.phone ? (
              <a href={`tel:${owner.phone}`} className="num underline-offset-4 hover:text-foreground hover:underline">
                {formatPhone(owner.phone)}
              </a>
            ) : (
              '—'
            )}{' '}
            · {tz} · {a.common.readOnly}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone={STATE_TONE[access.state]}>
              {a.state[access.state]}
              {access.daysLeft > 0 && ` · ${a.businesses.daysLeft(access.daysLeft)}`}
            </StatusBadge>
            {owner?.accountId && (
              <Link href={`/admin/users/${owner.accountId}`} className="text-xs font-medium text-primary hover:underline">
                {a.businesses.owner} →
              </Link>
            )}
          </div>
        }
      >
        <Segmented
          size="sm"
          label={a.nav.businesses}
          current={tab}
          items={TABS.map((x) => ({ key: x, label: a.businesses.tabs[x], href: href(x) }))}
        />
      </PageHeader>

      {tab === 'overview' && (
        <>
          <MetricStrip columns={3}>
            {periods.map((p) => (
              <Metric
                key={p.label}
                label={p.label}
                value={money(p.st.revenue)}
                hint={`${p.st.count} ${a.businesses.cars.toLowerCase()} · ${a.businesses.payroll} ${money(p.st.payroll)}${p.st.avgCheck ? ` · ${a.businesses.avgCheck} ${money(p.st.avgCheck)}` : ''}`}
              />
            ))}
          </MetricStrip>

          <PanelGrid>
            <Panel className="lg:col-span-4" title={a.businesses.subscription}>
              <DetailList>
                <DetailRow label={a.common.status} value={a.state[access.state]} />
                <DetailRow label={a.businesses.trialEnds} value={date(tenant.trialEndsAt)} mono />
                <DetailRow label={a.businesses.paidUntil} value={date(tenant.paidUntil)} mono />
                <DetailRow label={a.common.created} value={date(tenant.createdAt)} mono />
              </DetailList>
              <div className="mt-4 border-t border-border pt-4">
                <TenantActions
                  tenantId={tenant.id}
                  name={tenant.name}
                  blocked={access.state === 'blocked'}
                  note={tenant.adminNote}
                  canAct={canAct}
                />
              </div>
            </Panel>

            <Panel className="lg:col-span-4" title={a.businesses.team} count={staff.length} description={a.businesses.teamNote} padded={false}>
              {staff.length === 0 ? (
                <EmptyState compact title={a.common.empty} />
              ) : (
                <ul className="divide-y divide-border">
                  {staff.map((s) => (
                    <li key={s.id} className="px-4 py-2">
                      <Person
                        name={s.name}
                        size="sm"
                        note={`${s.role === 'owner' ? a.users.roleOwner : a.users.roleStaff} · ${formatPhone(s.phone)}${s.role === 'staff' ? ` · ${s.percent}%` : ''}`}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="lg:col-span-4" title={a.businesses.settings}>
              <DetailList>
                <DetailRow label={a.businesses.niche} value={niche?.name ?? tenant.niche} />
                <DetailRow label={a.businesses.locale} value={tenant.locale} mono />
                <DetailRow label={a.businesses.timezone} value={tz} mono />
                <DetailRow label={a.businesses.teamPercent} value={tenant.teamPercent === null ? a.common.none : `${tenant.teamPercent}%`} mono />
                <DetailRow label={a.businesses.tiers} value={tenant.tiers?.length ? tenant.tiers.join(', ') : a.common.none} />
              </DetailList>
              {siblings.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <div className="mb-1.5 text-2xs font-medium tracking-wider text-muted-foreground uppercase">{a.businesses.siblings}</div>
                  <ul className="flex flex-col gap-1 text-sm">
                    {siblings.map((s) => (
                      <li key={s.id}>
                        <Link href={`/admin/businesses/${s.id}`} className="hover:underline">
                          {s.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Panel>

            <Panel className="lg:col-span-12" title={a.businesses.recentOrders} count={feed.length || undefined} padded={false}>
              {feed.length === 0 ? (
                <EmptyState compact title={a.businesses.noOrders} />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{a.common.date}</TableHead>
                      <TableHead>{tenant.clientIdLabel}</TableHead>
                      <TableHead>{a.common.who}</TableHead>
                      <TableHead>{a.common.what}</TableHead>
                      <TableHead className="text-right">{a.businesses.revenue}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {feed.map((o) => (
                      <TableRow key={o.id}>
                        <TableCell className="num text-muted-foreground">{whenShort(o.createdAt)}</TableCell>
                        <TableCell className="num font-medium">{o.clientKey ?? '—'}</TableCell>
                        <TableCell>{o.crew.map((c) => c.name).join(', ') || o.staffName || '—'}</TableCell>
                        <TableCell>{o.serviceName}</TableCell>
                        <TableCell className="num text-right">{money(o.price)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Panel>
          </PanelGrid>
        </>
      )}

      {tab === 'activity' && (
        <Panel title={a.businesses.tabs.activity} count={activity.length || undefined} padded={false}>
          {activity.length === 0 ? (
            <EmptyState compact title={a.businesses.activityEmpty} />
          ) : (
            <ul className="divide-y divide-border">
              {activity.map((row) => {
                const ph = activityPhrase(row, t, money);
                return (
                  <li key={row.id} className="flex items-baseline gap-2 px-4 py-2 text-sm">
                    <span className="num w-24 shrink-0 text-xs text-muted-foreground">
                      {date(row.at)} {hhmm(row.at, tz)}
                    </span>
                    <span className="font-medium">{ph.actor}</span>
                    <span className="text-muted-foreground">{ph.action}</span>
                    {ph.object && <span className="num">{ph.object}</span>}
                    {ph.note && <span className="text-xs text-muted-foreground">{ph.note}</span>}
                    {ph.amount && <span className="num ml-auto font-medium">{ph.amount}</span>}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      )}

      {tab === 'audit' && (
        <Panel title={a.businesses.tabs.audit} count={audit.length || undefined} padded={false}>
          {audit.length === 0 ? (
            <EmptyState compact title={a.businesses.auditEmpty} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{a.common.date}</TableHead>
                  <TableHead>{a.activity.admin}</TableHead>
                  <TableHead>{a.activity.action}</TableHead>
                  <TableHead>{a.common.reason}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {audit.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="num text-muted-foreground">{when(r.at)}</TableCell>
                    <TableCell>{r.adminName ?? '—'}</TableCell>
                    <TableCell>
                      {a.activity.actions[r.action] ?? r.action}
                      {r.data && typeof r.data === 'object' && 'months' in r.data && (
                        <span className="num ml-1.5 text-xs text-muted-foreground">
                          {String((r.data as { months?: number }).months)} мес · {money(Number((r.data as { amount?: number }).amount ?? 0))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}

      {tab === 'payments' && (
        <Panel title={a.businesses.tabs.payments} count={payments.length || undefined} padded={false}>
          {payments.length === 0 ? (
            <EmptyState compact title={a.payments.empty} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{a.common.date}</TableHead>
                  <TableHead className="text-right">{a.payments.amount}</TableHead>
                  <TableHead className="text-right">{a.payments.months}</TableHead>
                  <TableHead>{a.payments.note}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="num text-muted-foreground">{when(p.at)}</TableCell>
                    <TableCell className="num text-right font-medium">{money(p.amount)}</TableCell>
                    <TableCell className="num text-right">{p.months}</TableCell>
                    <TableCell className="text-muted-foreground">{p.note ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      )}
    </>
  );
}
