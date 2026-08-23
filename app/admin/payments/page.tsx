import Link from 'next/link';
import { ensureDb } from '@/lib/db/ready';
import { allPayments, paymentTotals } from '@/lib/admin-billing';
import { formatMoney } from '@/lib/money';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { EmptyState } from '@/components/patterns/states';
import { TableShell, cellNum, headNum } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { plural, when } from '../format';

/**
 * Наши деньги.
 *
 * Страница отвечает на три вопроса, которые до сих пор жили в голове:
 * сколько получено в этом месяце, больше или меньше прошлого, и кто
 * когда платил.
 *
 * Валюта берётся из прайса, а не у клиента: платят нам в драмах
 * независимо от того, в чём считает свою выручку мойка.
 */
const head = 'h-9 px-4 text-xs text-muted-foreground';
const cell = 'px-4 py-2.5';

export default async function PaymentsPage() {
  await ensureDb();

  const [rows, totals] = await Promise.all([allPayments(), paymentTotals()]);
  const money = (n: number) => formatMoney(n, 'AMD');

  const diff = totals.month - totals.prevMonth;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';

  return (
    <>
      <PageHeader className="mb-0" title="Платежи" description="Всё, что получено за подписки" />

      <MetricStrip columns={4}>
        <Metric
          label="В этом месяце"
          value={money(totals.month)}
          tone={totals.month > 0 ? 'success' : 'default'}
        />
        <Metric label="В прошлом" value={money(totals.prevMonth)} />
        <Metric
          label="Разница"
          value={`${sign}${money(Math.abs(diff))}`}
          tone={diff > 0 ? 'success' : diff < 0 ? 'destructive' : 'muted'}
        />
        <Metric
          label="За всё время"
          value={money(totals.total)}
          hint={`${totals.count} ${plural(totals.count, 'платёж', 'платежа', 'платежей')}`}
        />
      </MetricStrip>

      {rows.length === 0 ? (
        <EmptyState title="Платежей пока нет" />
      ) : (
        <TableShell>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className={head}>Дата</TableHead>
                <TableHead className={head}>Бизнес</TableHead>
                <TableHead className={`${head} ${headNum}`}>Сумма</TableHead>
                <TableHead className={`${head} ${headNum}`}>Месяцев</TableHead>
                <TableHead className={head}>Принял</TableHead>
                <TableHead className={head}>Комментарий</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className={`${cell} num text-muted-foreground`}>{when(p.at)}</TableCell>
                  <TableCell className={`${cell} font-semibold`}>
                    <Link
                      href={`/admin/t/${p.tenantId}`}
                      className="underline-offset-4 hover:underline"
                    >
                      {p.tenantName}
                    </Link>
                  </TableCell>
                  <TableCell className={`${cell} font-semibold ${cellNum}`}>{money(p.amount)}</TableCell>
                  <TableCell className={`${cell} text-muted-foreground ${cellNum}`}>{p.months}</TableCell>
                  <TableCell className={`${cell} text-muted-foreground`}>{p.adminName ?? '—'}</TableCell>
                  <TableCell className={`${cell} whitespace-normal text-muted-foreground`}>
                    {p.note ?? ''}
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
