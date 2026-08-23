import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { listAdminAudit, listAdmins, listLegacyAdminAudit, listSecurityEvents, securityEventKinds } from '@/lib/admin-queries';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { when } from '@/components/admin/format';
import { LevelBadge } from '@/components/admin/level-badge';
import { SortSelect } from '@/components/admin/list-tools';

const TABS = ['admin', 'security'] as const;
type Tab = (typeof TABS)[number];

/**
 * Журнал: что делали админы и что видела защита. Две ленты, потому что
 * вопросы разные: «кто продлил Комитас» и «кто перебирает коды ночью».
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; action?: string; admin?: string; level?: string; event?: string }>;
}) {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const sp = await searchParams;
  const tab: Tab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as Tab) : 'admin';

  const href = (patch: Record<string, string>) => {
    const next = { tab, action: sp.action ?? '', admin: sp.admin ?? '', level: sp.level ?? '', event: sp.event ?? '', ...patch };
    const p = new URLSearchParams();
    if (next.tab !== 'admin') p.set('tab', next.tab);
    for (const k of ['action', 'admin', 'level', 'event'] as const) if (next[k] && next[k] !== 'all') p.set(k, next[k]);
    const s = p.toString();
    return s ? `/admin/activity?${s}` : '/admin/activity';
  };

  const [fresh, legacy, admins, events, kinds] = await Promise.all([
    tab === 'admin' ? listAdminAudit({ action: sp.action || undefined, adminId: sp.admin || undefined, limit: 200 }) : [],
    tab === 'admin' && !sp.action && !sp.admin ? listLegacyAdminAudit(100) : [],
    listAdmins(),
    tab === 'security' ? listSecurityEvents({ level: sp.level || undefined, event: sp.event || undefined, limit: 200 }) : [],
    tab === 'security' ? securityEventKinds() : [],
  ]);

  const adminRows = [
    ...fresh.map((r) => ({ id: r.id, at: r.createdAt, admin: r.adminName, action: r.action, target: r.targetLabel, targetType: r.targetType, targetId: r.targetId, reason: r.reason, ip: r.ip })),
    ...legacy.map((r) => ({ id: r.id, at: r.at, admin: r.adminName, action: r.action, target: r.tenantName, targetType: 'tenant', targetId: r.tenantId, reason: null, ip: null })),
  ].sort((x, y) => y.at.getTime() - x.at.getTime());

  const actionKeys = Object.keys(a.activity.actions).filter((k) => k.includes('.'));

  return (
    <>
      <PageHeader className="mb-0" title={a.activity.title} description={a.activity.lead}>
        <Segmented size="sm" label={a.activity.title} current={tab} items={TABS.map((x) => ({ key: x, label: a.activity.tabs[x], href: href({ tab: x }) }))} />
        {tab === 'admin' ? (
          <>
            <SortSelect
              label={a.activity.filterAction}
              value={sp.action ?? 'all'}
              options={[{ value: 'all', label: a.common.all, href: href({ action: '' }) }, ...actionKeys.map((k) => ({ value: k, label: a.activity.actions[k], href: href({ action: k }) }))]}
            />
            <SortSelect
              label={a.activity.filterAdmin}
              value={sp.admin ?? 'all'}
              options={[{ value: 'all', label: a.common.all, href: href({ admin: '' }) }, ...admins.map((x) => ({ value: x.id, label: x.name, href: href({ admin: x.id }) }))]}
            />
          </>
        ) : (
          <>
            <SortSelect
              label={a.activity.filterLevel}
              value={sp.level ?? 'all'}
              options={[
                { value: 'all', label: a.common.all, href: href({ level: '' }) },
                { value: 'warn', label: a.activity.levels.warn, href: href({ level: 'warn' }) },
                { value: 'alert', label: a.activity.levels.alert, href: href({ level: 'alert' }) },
              ]}
            />
            <SortSelect
              label={a.activity.event}
              value={sp.event ?? 'all'}
              options={[{ value: 'all', label: a.common.all, href: href({ event: '' }) }, ...kinds.map((k) => ({ value: k, label: k, href: href({ event: k }) }))]}
            />
          </>
        )}
      </PageHeader>

      {tab === 'admin' ? (
        adminRows.length === 0 ? (
          <EmptyState title={a.activity.empty} />
        ) : (
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{a.common.date}</TableHead>
                  <TableHead>{a.activity.admin}</TableHead>
                  <TableHead>{a.activity.action}</TableHead>
                  <TableHead>{a.common.target}</TableHead>
                  <TableHead>{a.common.reason}</TableHead>
                  <TableHead>{a.common.ip}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {adminRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="num text-muted-foreground">{when(r.at)}</TableCell>
                    <TableCell>{r.admin ?? '—'}</TableCell>
                    <TableCell>{a.activity.actions[r.action] ?? r.action}</TableCell>
                    <TableCell>
                      {r.targetId && (r.targetType === 'tenant' || r.targetType === 'account') ? (
                        <Link href={r.targetType === 'tenant' ? `/admin/businesses/${r.targetId}` : `/admin/users/${r.targetId}`} className="num hover:underline">
                          {r.target ?? r.targetId}
                        </Link>
                      ) : (
                        <span className="num">{r.target ?? '—'}</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-64 truncate text-muted-foreground">{r.reason ?? '—'}</TableCell>
                    <TableCell className="num text-xs text-muted-foreground">{r.ip ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableShell>
        )
      ) : events.length === 0 ? (
        <EmptyState title={a.activity.empty} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.common.date}</TableHead>
                <TableHead>{a.activity.level}</TableHead>
                <TableHead>{a.activity.event}</TableHead>
                <TableHead>{a.common.phone}</TableHead>
                <TableHead>{a.businesses.business}</TableHead>
                <TableHead>{a.common.ip}</TableHead>
                <TableHead>{a.common.what}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="num text-muted-foreground">{when(e.at)}</TableCell>
                  <TableCell>
                    <LevelBadge level={e.level} />
                  </TableCell>
                  <TableCell className="num">{e.event}</TableCell>
                  <TableCell className="num">
                    {e.accountId ? (
                      <Link href={`/admin/users/${e.accountId}`} className="hover:underline">
                        {e.phone ? formatPhone(e.phone) : '—'}
                      </Link>
                    ) : e.phone ? (
                      formatPhone(e.phone)
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>
                    {e.tenantId ? (
                      <Link href={`/admin/businesses/${e.tenantId}`} className="hover:underline">
                        {e.tenantName ?? '—'}
                      </Link>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="num text-xs text-muted-foreground">{e.ip ?? '—'}</TableCell>
                  <TableCell className="num max-w-64 truncate text-xs text-muted-foreground">
                    {e.data ? Object.entries(e.data).map(([k, v]) => `${k}: ${String(v)}`).join(' · ') : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </>
  );
}
