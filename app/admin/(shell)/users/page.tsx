import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { listAccounts, type AccountFilter } from '@/lib/admin-queries';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Segmented } from '@/components/patterns/segmented';
import { StatusBadge } from '@/components/patterns/status-badge';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { date, daysAgo } from '@/components/admin/format';
import { SearchForm } from '@/components/admin/list-tools';

const FILTERS: AccountFilter[] = ['all', 'owners', 'staff', 'blocked'];
const PAGE = 200;

/**
 * Люди платформы: кто, где работает, когда заходил, заблокирован ли.
 * Один человек одной строкой, сколько бы моек у него ни было.
 */
export default async function UsersPage({ searchParams }: { searchParams: Promise<{ q?: string; f?: string }> }) {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const sp = await searchParams;
  const q = sp.q ?? '';
  const filter = (FILTERS as string[]).includes(sp.f ?? '') ? (sp.f as AccountFilter) : 'all';

  const all = await listAccounts({ q, filter });
  const rows = all.slice(0, PAGE);
  const href = (f: AccountFilter) => {
    const p = new URLSearchParams();
    if (q) p.set('q', q);
    if (f !== 'all') p.set('f', f);
    const s = p.toString();
    return s ? `/admin/users?${s}` : '/admin/users';
  };

  return (
    <>
      <PageHeader className="mb-0" title={a.users.title} description={a.users.lead} meta={<span className="num">· {a.users.count(all.length)}</span>}>
        <SearchForm defaultValue={q} placeholder={a.users.searchPlaceholder} hidden={{ f: filter }} />
        <Segmented size="sm" label={a.common.status} current={filter} items={FILTERS.map((f) => ({ key: f, label: a.users.filter[f], href: href(f) }))} />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={a.common.nothingFound} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.users.person}</TableHead>
                <TableHead>{a.users.businesses}</TableHead>
                <TableHead>{a.common.status}</TableHead>
                <TableHead>{a.common.lastActive}</TableHead>
                <TableHead>{a.common.created}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const ago = daysAgo(r.lastSeenAt);
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={`/admin/users/${r.id}`} className="num font-medium hover:underline">
                        {formatPhone(r.phone)}
                      </Link>
                      <span className="block truncate text-xs text-muted-foreground">{r.names.join(', ') || '—'}</span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-x-2 gap-y-0.5 text-xs">
                        {r.memberships.slice(0, 3).map((m) => (
                          <span key={m.tenantId} className={m.active ? '' : 'text-muted-foreground line-through'}>
                            {m.tenantName}
                            <span className="text-muted-foreground"> · {m.role === 'owner' ? a.users.roleOwner : a.users.roleStaff}</span>
                          </span>
                        ))}
                        {r.memberships.length > 3 && <span className="num text-muted-foreground">+{r.memberships.length - 3}</span>}
                        {r.memberships.length === 0 && <span className="text-muted-foreground">—</span>}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1">
                        {r.blockedAt ? (
                          <StatusBadge tone="danger">{a.common.blocked}</StatusBadge>
                        ) : (
                          <StatusBadge tone="success">{a.common.active}</StatusBadge>
                        )}
                        {!r.verified && <StatusBadge tone="neutral">{a.common.unverified}</StatusBadge>}
                      </span>
                    </TableCell>
                    <TableCell className="num text-xs text-muted-foreground">
                      {ago === null ? a.common.never : ago === 0 ? a.common.today : a.common.daysAgo(ago)}
                    </TableCell>
                    <TableCell className="num text-xs text-muted-foreground">{date(r.createdAt)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </>
  );
}
