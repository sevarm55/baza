'use client';

import { ChartPanel } from '@/components/patterns/chart-panel';
import { PersonAvatar } from '@/components/patterns/person';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { TeamRow } from '../model';

/**
 * Команда за отрезок: кто сколько сделал и сколько ему начислено.
 * Порядок по начисленному, потому что это зарплата; полоса рядом
 * показывает долю в фонде. Часов на смену только если смены были.
 */
export function TeamTable({
  rows,
  currency,
  unitLabel,
  compact = false,
  className,
}: {
  rows: TeamRow[];
  currency: string;
  /** «Машины» словами бизнеса */
  unitLabel: string;
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const hasShifts = rows.some((r) => r.shifts > 0);

  return (
    <ChartPanel
      className={className}
      title={c.team}
      description={c.teamNote}
      status={rows.length === 0 ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height="h-56"
      padded={false}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{c.person}</TableHead>
            <TableHead className="text-right">{unitLabel}</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden xl:table-cell')}>{c.revenue}</TableHead>
            <TableHead className="text-right">{c.earned}</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden xl:table-cell')}>{c.avgCheck}</TableHead>
            {!compact && hasShifts && <TableHead className="text-right">{c.shifts}</TableHead>}
            {!compact && hasShifts && <TableHead className="text-right">{c.perShift}</TableHead>}
            <TableHead className="w-28">{c.share}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell>
                <span className="flex items-center gap-2">
                  <PersonAvatar name={r.name} size="sm" />
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="num text-xs text-muted-foreground">{r.percent}%</span>
                </span>
              </TableCell>
              <TableCell className="num text-right">{r.count}</TableCell>
              <TableCell className={cn('num text-right text-muted-foreground', compact && 'hidden xl:table-cell')}>
                {money(r.revenue)}
              </TableCell>
              <TableCell className="num text-right font-medium">{money(r.earned)}</TableCell>
              <TableCell className={cn('num text-right text-muted-foreground', compact && 'hidden xl:table-cell')}>
                {money(r.avgCheck)}
              </TableCell>
              {!compact && hasShifts && <TableCell className="num text-right">{r.shifts}</TableCell>}
              {!compact && hasShifts && (
                <TableCell className="num text-right text-muted-foreground">
                  {r.shifts > 0 ? Math.round((r.hours / r.shifts) * 10) / 10 : '—'}
                </TableCell>
              )}
              <TableCell>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-muted" aria-hidden>
                    <div className="h-full rounded-sm bg-chart-3" style={{ width: `${Math.min(100, Math.max(2, r.share))}%` }} />
                  </div>
                  <span className="num w-10 text-right text-xs text-muted-foreground">{r.share}%</span>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ChartPanel>
  );
}
