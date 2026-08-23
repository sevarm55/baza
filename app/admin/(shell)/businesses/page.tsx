import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { listBusinesses, type BusinessFilter, type BusinessSort } from '@/lib/admin-queries';
import { formatMoney } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Segmented } from '@/components/patterns/segmented';
import { StatusBadge } from '@/components/patterns/status-badge';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { STATE_TONE, date } from '@/components/admin/format';
import { SearchForm, SortSelect } from '@/components/admin/list-tools';

const FILTERS: BusinessFilter[] = ['all', 'attention', 'trial', 'active', 'unpaid', 'expired', 'blocked'];
const SORTS: BusinessSort[] = ['created', 'revenue', 'activity', 'expiry'];

/**
 * Все бизнесы таблицей: плотно, с поиском, фильтром по состоянию и
 * сортировкой. Строка ведёт в карточку; звонить можно прямо отсюда.
 */
export default async function BusinessesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; sort?: string }>;
}) {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const sp = await searchParams;
  const q = sp.q ?? '';
  const state = (FILTERS as string[]).includes(sp.state ?? '') ? (sp.state as BusinessFilter) : 'all';
  const sort = (SORTS as string[]).includes(sp.sort ?? '') ? (sp.sort as BusinessSort) : 'created';

  const rows = await listBusinesses({ q, state, sort });
  const href = (patch: Record<string, string>) => {
    const p = new URLSearchParams();
    const next = { q, state, sort, ...patch };
    if (next.q) p.set('q', next.q);
    if (next.state !== 'all') p.set('state', next.state);
    if (next.sort !== 'created') p.set('sort', next.sort);
    const s = p.toString();
    return s ? `/admin/businesses?${s}` : '/admin/businesses';
  };

  return (
    <>
      <PageHeader className="mb-0" title={a.businesses.title} description={a.businesses.lead} meta={<span className="num">· {a.businesses.count(rows.length)}</span>}>
        <SearchForm defaultValue={q} placeholder={a.businesses.searchPlaceholder} hidden={{ state, sort }} />
        <Segmented
          size="sm"
          label={a.common.status}
          current={state}
          items={FILTERS.map((f) => ({ key: f, label: f === 'all' ? a.common.all : a.state[f], href: href({ state: f }) }))}
        />
        <SortSelect
          label={a.businesses.sortBy}
          value={sort}
          options={SORTS.map((s) => ({ value: s, label: a.businesses.sort[s], href: href({ sort: s }) }))}
        />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState title={a.common.nothingFound} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.businesses.business}</TableHead>
                <TableHead>{a.businesses.owner}</TableHead>
                <TableHead className="text-right">{a.businesses.employees}</TableHead>
                <TableHead>{a.businesses.plan}</TableHead>
                <TableHead>{a.businesses.until}</TableHead>
                <TableHead className="text-right">{a.common.recordsLabel}</TableHead>
                <TableHead className="text-right">{a.businesses.revenue}</TableHead>
                <TableHead>{a.businesses.lastOrder}</TableHead>
                <TableHead>{a.common.created}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((t) => {
                const until = t.access.state === 'trial' ? t.trialEndsAt : t.paidUntil;
                return (
                  <TableRow key={t.id}>
                    <TableCell>
                      <Link href={`/admin/businesses/${t.id}`} className="font-medium hover:underline">
                        {t.name}
                      </Link>
                      {t.ownerPoints > 1 && (
                        <span className="num ml-1.5 text-xs text-muted-foreground">· {a.common.points(t.ownerPoints)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="block truncate">{t.ownerName ?? '—'}</span>
                      <a href={t.ownerPhone ? `tel:${t.ownerPhone}` : undefined} className="num block text-xs text-muted-foreground hover:text-foreground">
                        {t.ownerPhone ? formatPhone(t.ownerPhone) : '—'}
                      </a>
                    </TableCell>
                    <TableCell className="num text-right">{t.staffCount}</TableCell>
                    <TableCell>
                      <StatusBadge tone={STATE_TONE[t.access.state]}>
                        {a.state[t.access.state]}
                        {t.access.daysLeft > 0 && ` · ${t.access.daysLeft}`}
                      </StatusBadge>
                    </TableCell>
                    <TableCell className="num text-muted-foreground">{until ? date(until) : '—'}</TableCell>
                    <TableCell className="num text-right">{t.orderCount}</TableCell>
                    <TableCell className="num text-right">{formatMoney(t.revenue, t.currency, 'ru')}</TableCell>
                    <TableCell className="num text-xs text-muted-foreground">
                      {t.orderCount === 0
                        ? a.businesses.noActivity
                        : t.idleDays === 0
                          ? a.businesses.workedToday
                          : a.businesses.idle(t.idleDays ?? 0)}
                    </TableCell>
                    <TableCell className="num text-xs text-muted-foreground">{date(t.createdAt)}</TableCell>
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
