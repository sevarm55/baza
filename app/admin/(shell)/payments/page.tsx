import Link from 'next/link';

import { requireAdmin } from '@/lib/admin-auth';
import { ensureDb } from '@/lib/db/ready';
import { allPayments, paymentTotals } from '@/lib/admin-billing';
import { formatMoney } from '@/lib/money';
import { getAdminDict } from '@/lib/i18n/admin/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { when } from '@/components/admin/format';

/** Наши деньги: что получили и когда. Записывается продлением. */
export default async function PaymentsPage() {
  await requireAdmin();
  await ensureDb();
  const a = await getAdminDict();
  const [totals, rows] = await Promise.all([paymentTotals(), allPayments()]);
  const money = (n: number) => formatMoney(n, 'AMD', 'ru');

  return (
    <>
      <PageHeader className="mb-0" title={a.payments.title} description={a.payments.lead} />
      <MetricStrip columns={4}>
        <Metric label={a.payments.month} value={money(totals.month)} />
        <Metric label={a.payments.prevMonth} value={money(totals.prevMonth)} />
        <Metric label={a.payments.total} value={money(totals.total)} />
        <Metric label={a.payments.count} value={String(totals.count)} />
      </MetricStrip>

      {rows.length === 0 ? (
        <EmptyState title={a.payments.empty} />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{a.common.date}</TableHead>
                <TableHead>{a.payments.business}</TableHead>
                <TableHead className="text-right">{a.payments.amount}</TableHead>
                <TableHead className="text-right">{a.payments.months}</TableHead>
                <TableHead>{a.payments.by}</TableHead>
                <TableHead>{a.payments.note}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="num text-muted-foreground">{when(p.at)}</TableCell>
                  <TableCell>
                    <Link href={`/admin/businesses/${p.tenantId}`} className="font-medium hover:underline">
                      {p.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className="num text-right font-medium">{money(p.amount)}</TableCell>
                  <TableCell className="num text-right">{p.months}</TableCell>
                  <TableCell className="text-muted-foreground">{p.adminName ?? a.title}</TableCell>
                  <TableCell className="text-muted-foreground">{p.note ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableShell>
      )}
    </>
  );
}
