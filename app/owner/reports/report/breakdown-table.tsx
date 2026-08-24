'use client';

import { ChartPanel } from '@/components/patterns/chart-panel';
import { DesktopOnly, MobileDataList, MobileDataRow, MobileOnly } from '@/components/mobile';
import { Delta } from '@/components/patterns/metric';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { CostRow, ServiceRow } from '../model';

/** Полоса доли внутри клетки таблицы: число и его величина рядом. */
function ShareBar({ share, tone = 'var(--chart-1)' }: { share: number; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-sm bg-muted" aria-hidden>
        <div className="h-full rounded-sm" style={{ width: `${Math.min(100, Math.max(2, share))}%`, background: tone }} />
      </div>
      <span className="num w-10 text-right text-xs text-muted-foreground">{share}%</span>
    </div>
  );
}

/** Услуги: сколько раз, выручка, средний чек, доля. Полосы в клетках,
 * чтобы таблица читалась и как рейтинг, и как точные числа. */
export function ServicesTable({
  rows,
  currency,
  compact = false,
  className,
}: {
  rows: ServiceRow[];
  currency: string;
  /** на обзоре: первые шесть строк */
  compact?: boolean;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const shown = compact ? rows.slice(0, 6) : rows;

  return (
    <ChartPanel
      className={className}
      title={c.services}
      description={c.servicesNote}
      status={rows.length === 0 ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height="h-56"
      padded={false}
    >
      {/* На телефоне строками: услуга, сколько раз и на сколько.
          Средний чек и доля идут пояснением — по ним не решают, их
          читают вторым взглядом. */}
      <MobileOnly className="px-4 pb-1">
        <MobileDataList>
          {shown.map((r) => (
            <MobileDataRow
              key={r.key}
              title={
                <span className="truncate text-[15.5px] font-semibold text-m-ink">{r.name}</span>
              }
              note={`${c.times} ${r.count} · ${c.avgCheck} ${money(r.avg)}`}
              value={money(r.revenue)}
              sub={`${Math.round(r.share * 100)}%`}
            />
          ))}
        </MobileDataList>
      </MobileOnly>

      <DesktopOnly>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{c.service}</TableHead>
            <TableHead className="text-right">{c.times}</TableHead>
            <TableHead className="text-right">{c.revenue}</TableHead>
            <TableHead className={cn('text-right', compact && 'hidden xl:table-cell')}>{c.avgCheck}</TableHead>
            <TableHead className="w-32">{c.share}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {shown.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="max-w-48 truncate font-medium">{r.name}</TableCell>
              <TableCell className="num text-right">{r.count}</TableCell>
              <TableCell className="num text-right font-medium">{money(r.revenue)}</TableCell>
              <TableCell className={cn('num text-right text-muted-foreground', compact && 'hidden xl:table-cell')}>
                {money(r.avg)}
              </TableCell>
              <TableCell>
                <ShareBar share={r.share} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </DesktopOnly>
    </ChartPanel>
  );
}

/** Расходы по статьям: сумма, доля, изменение к предыдущему отрезку. */
export function CostsTable({
  rows,
  currency,
  compare,
  className,
}: {
  rows: CostRow[];
  currency: string;
  compare: boolean;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <ChartPanel
      className={className}
      title={c.costs}
      description={c.costsNote}
      status={rows.length === 0 ? 'empty' : 'ok'}
      emptyTitle={t.expenses.empty}
      height="h-56"
      padded={false}
    >
      <MobileOnly className="px-4 pb-1">
        <MobileDataList>
          {rows.map((r) => (
            <MobileDataRow
              key={r.key}
              title={<span className="truncate text-[15.5px] font-semibold text-m-ink">{r.name}</span>}
              note={`${r.monthly ? t.expenses.perMonth : t.expenses.oneOff} · ${Math.round(r.share * 100)}%`}
              value={money(r.amount)}
              sub={
                compare
                  ? r.prev === null
                    ? c.new
                    : `${r.amount - r.prev > 0 ? '+' : '−'}${money(Math.abs(r.amount - r.prev))}`
                  : undefined
              }
            />
          ))}
        </MobileDataList>
      </MobileOnly>

      <DesktopOnly>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{c.category}</TableHead>
            <TableHead className="text-right">{c.amount}</TableHead>
            <TableHead className="w-32">{c.share}</TableHead>
            {compare && <TableHead className="text-right">{c.change}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.key}>
              <TableCell className="max-w-48 truncate">
                <span className="font-medium">{r.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {r.monthly ? t.expenses.perMonth : t.expenses.oneOff}
                </span>
              </TableCell>
              <TableCell className="num text-right font-medium">{money(r.amount)}</TableCell>
              <TableCell>
                <ShareBar share={r.share} tone="var(--warning)" />
              </TableCell>
              {compare && (
                <TableCell className="text-right">
                  {r.prev === null ? (
                    <span className="text-xs text-muted-foreground">{c.new}</span>
                  ) : (
                    <Delta value={r.amount - r.prev} formatted={money(Math.abs(r.amount - r.prev))} good="down" />
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      </DesktopOnly>
    </ChartPanel>
  );
}
