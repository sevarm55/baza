import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { supportSearch, accountDetail } from '@/lib/admin-queries';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { STATE_TONE, date, when } from '@/components/admin/format';
import { SearchForm } from '@/components/admin/list-tools';

/**
 * Поддержка: один поиск на всё. Клиент звонит и называет номер, мойку
 * или машину; здесь по любому из них видно состояние целиком и
 * диагноз, почему не входит или не работает.
 */
export default async function SupportPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const q = (await searchParams).q ?? '';
  const found = q ? await supportSearch(q) : null;

  /* Диагноз по первому найденному человеку: чаще всего звонит он. */
  const first = found?.people[0] ? await accountDetail(found.people[0].id) : null;
  const diagnosis: string[] = [];
  if (first) {
    if (first.account.blockedAt) diagnosis.push(a.support.diag.blockedAccount);
    const active = first.memberships.filter((m) => m.active);
    if (active.length === 0) diagnosis.push(a.support.diag.noMemberships);
    for (const m of active) {
      if (m.access.state === 'expired') diagnosis.push(a.support.diag.expired(m.tenantName));
      if (m.access.state === 'blocked') diagnosis.push(a.support.diag.blockedTenant(m.tenantName));
      if (m.access.state === 'unpaid') diagnosis.push(a.support.diag.unpaid(m.tenantName));
    }
    if (first.account.pinHash === 'none') diagnosis.push(a.support.diag.noPin);
    if (!first.account.phoneVerifiedAt) diagnosis.push(a.support.diag.unverified);
    if (first.failedLogins > 0) diagnosis.push(a.support.diag.failedLogins(first.failedLogins));
    if (diagnosis.length === 0) diagnosis.push(a.support.diag.ok);
  }

  return (
    <>
      <PageHeader className="mb-0" title={a.support.title} description={a.support.lead}>
        <SearchForm defaultValue={q} placeholder={a.support.placeholder} action="/admin/support" />
        <span className="text-xs text-muted-foreground">{a.support.hint}</span>
      </PageHeader>

      {found && (
        <PanelGrid>
          {first && (
            <Panel className="lg:col-span-12" title={a.support.diagnosis} description={<span className="num">{formatPhone(first.account.phone)}</span>}>
              <ul className="flex flex-col gap-1 text-sm">
                {diagnosis.map((d) => (
                  <li key={d} className="flex items-center gap-2">
                    <span aria-hidden className={`size-1.5 rounded-full ${d === a.support.diag.ok ? 'bg-success' : 'bg-warning'}`} />
                    {d}
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel className="lg:col-span-4" title={a.support.people} count={found.people.length || undefined} padded={false}>
            {found.people.length === 0 ? (
              <EmptyState compact title={a.common.nothingFound} />
            ) : (
              <ul className="divide-y divide-border">
                {found.people.map((p) => (
                  <li key={p.id} className="px-4 py-2 text-sm">
                    <Link href={`/admin/users/${p.id}`} className="num font-medium hover:underline">
                      {formatPhone(p.phone)}
                    </Link>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.names.join(', ') || '—'} · {p.memberships.map((m) => m.tenantName).join(', ') || '—'}
                    </span>
                    {p.blockedAt && <StatusBadge tone="danger">{a.common.blocked}</StatusBadge>}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="lg:col-span-4" title={a.support.businesses} count={found.businesses.length || undefined} padded={false}>
            {found.businesses.length === 0 ? (
              <EmptyState compact title={a.common.nothingFound} />
            ) : (
              <ul className="divide-y divide-border">
                {found.businesses.map((b) => (
                  <li key={b.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                    <span className="min-w-0 flex-1">
                      <Link href={`/admin/businesses/${b.id}`} className="font-medium hover:underline">
                        {b.name}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">
                        {b.ownerName ?? '—'} · {b.ownerPhone ? formatPhone(b.ownerPhone) : '—'} · {date(b.createdAt)}
                      </span>
                    </span>
                    <StatusBadge tone={STATE_TONE[b.access.state]}>{a.state[b.access.state]}</StatusBadge>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel className="lg:col-span-4" title={a.support.clients} count={found.clients.length || undefined} padded={false}>
            {found.clients.length === 0 ? (
              <EmptyState compact title={a.common.nothingFound} />
            ) : (
              <ul className="divide-y divide-border">
                {found.clients.map((c) => (
                  <li key={c.id} className="px-4 py-2 text-sm">
                    <span className="num font-medium">{c.key}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <Link href={`/admin/businesses/${c.tenantId}`} className="hover:underline">
                        {c.tenantName}
                      </Link>{' '}
                      · {a.support.visits(c.visits)} · {formatMoney(c.total, 'AMD', 'ru')} · {when(c.lastSeenAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </PanelGrid>
      )}
    </>
  );
}
