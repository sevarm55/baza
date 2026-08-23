'use client';

import { ChartPanel } from '@/components/patterns/chart-panel';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { BranchRow } from '../model';

/** Филиалы один под другим за один и тот же отрезок. Текущий выделен. */
export function BranchCompare({
  rows,
  currency,
  unitLabel,
  className,
}: {
  rows: BranchRow[];
  currency: string;
  unitLabel: string;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const k = t.reports.kpi;
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <ChartPanel className={className} title={c.branches} description={c.branchesNote} padded={false} height="h-40">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t.reports.branch}</TableHead>
            <TableHead className="text-right">{k.revenue}</TableHead>
            <TableHead className="text-right">{k.net}</TableHead>
            <TableHead className="text-right">{unitLabel}</TableHead>
            <TableHead className="text-right">{k.avgCheck}</TableHead>
            <TableHead className="text-right">{k.payroll}</TableHead>
            <TableHead className="text-right">{k.costs}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.id} className={cn(r.current && 'bg-primary-soft/40')}>
              <TableCell className="font-medium">{r.name}</TableCell>
              <TableCell className="num text-right font-medium">{money(r.revenue)}</TableCell>
              <TableCell className={cn('num text-right font-medium', r.profit < 0 && 'text-destructive')}>
                {money(r.profit)}
              </TableCell>
              <TableCell className="num text-right">{r.count}</TableCell>
              <TableCell className="num text-right">{money(r.avgCheck)}</TableCell>
              <TableCell className="num text-right text-muted-foreground">{money(r.payroll)}</TableCell>
              <TableCell className="num text-right text-muted-foreground">{money(r.costs)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ChartPanel>
  );
}
