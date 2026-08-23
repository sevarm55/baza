'use client';

import { useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartPanel, ChartTip, compactNumber } from '@/components/patterns/chart-panel';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { unitCount } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import type { BranchSeries, Point } from '../model';

type SeriesKey = 'revenue' | 'payroll' | 'costs' | 'net' | 'prev';

const COLOR: Record<SeriesKey, string> = {
  revenue: 'var(--chart-1)',
  payroll: 'var(--chart-3)',
  costs: 'var(--chart-4)',
  net: 'var(--success)',
  prev: 'var(--chart-2)',
};

/**
 * Динамика денег по отрезку: выручка, зарплаты, расходы, чистыми и
 * предыдущий отрезок пунктиром. Серии включаются и выключаются
 * кнопками над графиком; выручка площадью, остальное линиями, чтобы
 * четыре ряда в одних осях не слипались.
 *
 * В режиме «по филиалам» вместо слагаемых рисуются выручки филиалов:
 * вопрос там другой, «кто из них как идёт», и смешивать его с
 * зарплатами нельзя.
 */
export function TrendChart({
  points,
  currency,
  unitOne,
  byHour,
  compare,
  branches,
  className,
  height = 'h-72',
}: {
  points: Point[];
  currency: string;
  unitOne: string;
  byHour: boolean;
  /** показывать предыдущий отрезок */
  compare: boolean;
  /** наложение филиалов вместо слагаемых */
  branches?: BranchSeries[];
  className?: string;
  height?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const [on, setOn] = useState<Record<SeriesKey, boolean>>({
    revenue: true,
    payroll: true,
    costs: !byHour,
    net: true,
    prev: compare,
  });
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const toggle = (k: SeriesKey) => setOn((s) => ({ ...s, [k]: !s[k] }));

  const empty = points.every((p) => p.revenue === 0 && p.payroll === 0 && p.costs === 0);
  const byBranch = !!branches && branches.length > 0;

  const data = byBranch
    ? points.map((p) => {
        const row: Record<string, number | string | null> = { key: p.key, label: p.label };
        for (const b of branches!) row[b.id] = b.points.find((x) => x.key === p.key)?.revenue ?? 0;
        return row;
      })
    : points.map((p) => ({ ...p, prev: p.prevRevenue }));

  const config: ChartConfig = byBranch
    ? Object.fromEntries(branches!.map((b) => [b.id, { label: b.name, color: b.color }]))
    : {
        revenue: { label: c.series.revenue, color: COLOR.revenue },
        payroll: { label: c.series.payroll, color: COLOR.payroll },
        costs: { label: c.series.costs, color: COLOR.costs },
        net: { label: c.series.net, color: COLOR.net },
        prev: { label: c.series.prev, color: COLOR.prev },
      };

  const keys: SeriesKey[] = byHour ? ['revenue', 'payroll', 'net', 'prev'] : ['revenue', 'payroll', 'costs', 'net', 'prev'];
  const hasLoss = !byBranch && on.net && points.some((p) => p.net < 0);

  return (
    <ChartPanel
      className={className}
      title={c.dynamics}
      description={c.dynamicsNote}
      status={empty ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height={height}
      actions={
        byBranch ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {branches!.map((b) => (
              <span key={b.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2 rounded-full" style={{ background: b.color }} />
                {b.name}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1">
            {keys
              .filter((k) => k !== 'prev' || compare)
              .map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on[k]}
                  onClick={() => toggle(k)}
                  className={cn(
                    'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors',
                    on[k]
                      ? 'border-border bg-card text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn('size-2 rounded-full', !on[k] && 'opacity-30')}
                    style={{ background: COLOR[k] }}
                  />
                  {c.series[k]}
                </button>
              ))}
          </div>
        )
      }
    >
      <ChartContainer config={config} className={cn('aspect-auto w-full', height)}>
        <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="trend-revenue" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={COLOR.revenue} stopOpacity={0.18} />
              <stop offset="100%" stopColor={COLOR.revenue} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={18}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => compactNumber(v)}
          />
          {hasLoss && <ReferenceLine y={0} stroke="var(--border)" />}
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Record<string, number | string | null>;
              if (byBranch) {
                return (
                  <ChartTip
                    title={String(p.label)}
                    rows={branches!.map((b) => ({
                      label: b.name,
                      value: money(Number(p[b.id] ?? 0)),
                      color: b.color,
                    }))}
                  />
                );
              }
              const pt = p as unknown as Point;
              const rows = [
                { label: c.series.revenue, value: money(pt.revenue), color: COLOR.revenue },
                { label: c.series.payroll, value: `−${money(pt.payroll)}`, color: COLOR.payroll },
                ...(byHour ? [] : [{ label: c.series.costs, value: `−${money(pt.costs)}`, color: COLOR.costs }]),
                { label: c.series.net, value: money(pt.net), color: COLOR.net },
                ...(compare && pt.prevRevenue !== null
                  ? [{ label: c.series.prev, value: money(pt.prevRevenue), color: COLOR.prev, muted: true }]
                  : []),
                { label: unitCount(pt.count, unitOne, t.locale), value: '', muted: true },
              ];
              return <ChartTip title={pt.label} rows={rows} />;
            }}
          />
          {byBranch ? (
            branches!.map((b) => (
              <Line
                key={b.id}
                type="monotone"
                dataKey={b.id}
                stroke={b.color}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            ))
          ) : (
            <>
              {on.revenue && (
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke={COLOR.revenue}
                  strokeWidth={2}
                  fill="url(#trend-revenue)"
                  dot={false}
                  isAnimationActive={false}
                />
              )}
              {on.payroll && (
                <Line type="monotone" dataKey="payroll" stroke={COLOR.payroll} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {!byHour && on.costs && (
                <Line type="monotone" dataKey="costs" stroke={COLOR.costs} strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {on.net && (
                <Line type="monotone" dataKey="net" stroke={COLOR.net} strokeWidth={2} dot={false} isAnimationActive={false} />
              )}
              {compare && on.prev && (
                <Line
                  type="monotone"
                  dataKey="prev"
                  stroke={COLOR.prev}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              )}
            </>
          )}
        </ComposedChart>
      </ChartContainer>
    </ChartPanel>
  );
}
