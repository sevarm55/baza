import Link from 'next/link';
import { notFound } from 'next/navigation';

import { logAdminAction, requireAdmin, roleAtLeast } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { accountDetail } from '@/lib/admin-queries';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_TONE, date, when } from '@/components/admin/format';
import { AccountActions } from '@/components/admin/account-actions';
import { LevelBadge } from '@/components/admin/level-badge';

/**
 * Человек целиком: номер, участия, сессии, события безопасности и то,
 * что с ним делала админка. Опасные действия с причиной и журналом.
 */
export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const { id } = await params;
  const d = await accountDetail(id);
  if (!d) notFound();

  await logAdminAction({ by: ctx, action: 'account.view', targetType: 'account', targetId: id, targetLabel: d.account.phone });
  const canAct = roleAtLeast(ctx.role, 'support');
  const phone = formatPhone(d.account.phone);
  const names = [...new Set(d.memberships.map((m) => m.name))];

  return (
    <>
      <PageHeader
        className="mb-0"
        back={{ href: '/admin/users', label: a.users.back }}
        title={<span className="num">{phone}</span>}
        description={`${names.join(', ') || '—'} · ${a.users.detailLead}`}
        actions={
          <span className="flex flex-wrap gap-1">
            {d.account.blockedAt ? <StatusBadge tone="danger">{a.common.blocked}</StatusBadge> : <StatusBadge tone="success">{a.common.active}</StatusBadge>}
            {d.admin?.active && <StatusBadge tone="lime">{a.roles[d.admin.role as 'owner' | 'support' | 'viewer'] ?? a.title}</StatusBadge>}
          </span>
        }
      />

      <PanelGrid>
        <Panel className="lg:col-span-4" title={a.users.person}>
          <DetailList>
            <DetailRow label={a.common.phone} value={phone} mono />
            <DetailRow label={a.common.verified} value={d.account.phoneVerifiedAt ? date(d.account.phoneVerifiedAt) : a.common.no} mono />
            <DetailRow label="PIN" value={d.account.pinHash !== 'none' ? a.users.pinSet : a.users.pinNone} />
            <DetailRow label={a.users.trialUsed} value={d.account.trialUsedAt ? date(d.account.trialUsedAt) : a.common.no} mono />
            <DetailRow label={a.common.created} value={date(d.account.createdAt)} mono />
            {d.account.blockedAt && (
              <DetailRow label={a.common.blocked} value={`${when(d.account.blockedAt)} · ${d.account.blockedReason ?? ''}`} />
            )}
            {d.failedLogins > 0 && <DetailRow label={a.support.diagnosis} value={a.support.diag.failedLogins(d.failedLogins)} />}
          </DetailList>
          <div className="mt-4 border-t border-border pt-4">
            <AccountActions
              accountId={d.account.id}
              phone={phone}
              blocked={!!d.account.blockedAt}
              hasSessions={d.sessions.length > 0}
              canAct={canAct && d.account.id !== ctx.admin.accountId}
            />
          </div>
        </Panel>

        <Panel className="lg:col-span-8" title={a.users.memberships} count={d.memberships.length || undefined} padded={false}>
          {d.memberships.length === 0 ? (
            <EmptyState compact title={a.common.empty} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{a.businesses.business}</TableHead>
                  <TableHead>{a.common.name}</TableHead>
                  <TableHead>{a.common.role}</TableHead>
                  <TableHead>{a.businesses.plan}</TableHead>
                  <TableHead>{a.common.status}</TableHead>
                  <TableHead>{a.common.lastActive}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.memberships.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <Link href={`/admin/businesses/${m.tenantId}`} className="font-medium hover:underline">
                        {m.tenantName}
                      </Link>
                    </TableCell>
                    <TableCell>{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {m.role === 'owner' ? a.users.roleOwner : `${a.users.roleStaff} · ${m.percent}%`}
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATE_TONE[m.access.state]}>{a.state[m.access.state]}</StatusBadge>
                    </TableCell>
                    <TableCell>{m.active ? a.common.active : <span className="text-muted-foreground">{a.users.membershipOff}</span>}</TableCell>
                    <TableCell className="num text-xs text-muted-foreground">{m.lastUsedAt ? when(m.lastUsedAt) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel className="lg:col-span-5" title={a.users.sessions} count={d.sessions.length || undefined} padded={false}>
          {d.sessions.length === 0 ? (
            <EmptyState compact title={a.users.sessionsEmpty} />
          ) : (
            <ul className="divide-y divide-border">
              {d.sessions.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">
                      {s.kind === 'app' ? a.users.kindApp : a.users.kindWeb}
                      {s.label && <span className="text-muted-foreground"> · {s.label}</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">{s.tenantName}</span>
                  </span>
                  <span className="num text-xs text-muted-foreground">{when(s.lastSeenAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="lg:col-span-7" title={a.users.security} count={d.events.length || undefined} padded={false}>
          {d.events.length === 0 ? (
            <EmptyState compact title={a.users.securityEmpty} />
          ) : (
            <ul className="max-h-[480px] divide-y divide-border overflow-y-auto">
              {d.events.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-4 py-1.5 text-xs">
                  <span className="num w-28 shrink-0 text-muted-foreground">{when(e.at)}</span>
                  <LevelBadge level={e.level} />
                  <span className="num min-w-0 flex-1 truncate">{e.event}</span>
                  <span className="num truncate text-muted-foreground">
                    {e.data && typeof e.data === 'object' && 'reason' in e.data ? String((e.data as { reason?: unknown }).reason) : ''}
                    {e.ip ? ` · ${e.ip}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        {d.actions.length > 0 && (
          <Panel className="lg:col-span-12" title={a.activity.tabs.admin} count={d.actions.length} padded={false}>
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
                {d.actions.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="num text-muted-foreground">{when(r.createdAt)}</TableCell>
                    <TableCell>{r.adminName ?? '—'}</TableCell>
                    <TableCell>{a.activity.actions[r.action] ?? r.action}</TableCell>
                    <TableCell className="text-muted-foreground">{r.reason ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        )}
      </PanelGrid>
    </>
  );
}
