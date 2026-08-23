import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { lastPayments, listBusinesses } from '@/lib/admin-queries';
import { formatMoney } from '@/lib/money';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Segmented } from '@/components/patterns/segmented';
import { StatusBadge } from '@/components/patterns/status-badge';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_TONE, date } from '@/components/admin/format';

const FILTERS = ['all', 'soon', 'trial', 'active', 'unpaid', 'expired', 'blocked'] as const;
type Filter = (typeof FILTERS)[number];

/** Подписки: состояние, сроки, последний платёж. Продление в карточке бизнеса. */
export default async function SubscriptionsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const f = (FILTERS as readonly string[]).includes((await searchParams).f ?? '') ? ((await searchParams).f as Filter) : 'all';

  const [all, last] = await Promise.all([listBusinesses({ sort: 'expiry' }), lastPayments()]);
  const rows = all.filter((t) => {
    if (f === 'all') return true;
    if (f === 'soon') return t.access.canRead && t.access.daysLeft <= 7 && t.access.state !== 'blocked';
    return t.access.state === f;
  });
  const money = (n: number) => formatMoney(n, 'AMD', 'ru');

  return (
    <>
      <PageHeader className="mb-0" title={a.subscriptions.title} description={a.subscriptions.lead} meta={<span className="num">· {a.subscriptions.count(rows.length)}</span>}>
        <Segmented
          size="sm"
          label={a.common.status}
          current={f}
          items={FILTERS.map((x) => ({ key: x, label: a.subscriptions.filter[x], href: x === 'all' ? '/admin/subscriptions' : `/admin/subscriptions?f=${x}` }))}
        />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={a.common.nothingFound} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.subscriptions.business}</TableHead>
                <TableHead>{a.subscriptions.plan}</TableHead>
                <TableHead className="text-right">{a.subscriptions.daysLeft}</TableHead>
                <TableHead>{a.subscriptions.trialEnds}</TableHead>
                <TableHead>{a.subscriptions.paidUntil}</TableHead>
                <TableHead>{a.subscriptions.lastPayment}</TableHead>
                <TableHead>{a.businesses.owner}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const p = last.get(t.id);
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/admin/businesses/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <StatusBadge tone={STATE_TONE[t.access.state]}>{a.state[t.access.state]}</StatusBadge>
                    </TableCell>
                    <TableCell className="num text-right">{t.access.daysLeft > 0 ? t.access.daysLeft : '—'}</TableCell>
                    <TableCell className="num text-muted-foreground">{date(t.trialEndsAt)}</TableCell>
                    <TableCell className="num text-muted-foreground">{date(t.paidUntil)}</TableCell>
                    <TableCell className="num text-muted-foreground">
                      {p ? `${date(p.at)} · ${money(p.amount)}` : a.subscriptions.noPayments}
                    </TableCell>
                    <TableCell className="truncate text-muted-foreground">{t.ownerName ?? '—'}</TableCell>
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
