'use client';

import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartPanel, ChartTip, compactNumber } from '@/components/patterns/chart-panel';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Point } from '../model';

/**
 * Средний чек по отрезку: сколько денег приносит одна машина и как это
 * меняется. Не выручка: выручка растёт от числа машин, чек от того,
 * что им продают. Дни без машин пропущены, линия через них не
 * проводится: нуля чека не бывает, бывает отсутствие машин.
 */
export function AvgCheckChart({
  points,
  avg,
  currency,
  compare,
  className,
  height = 'h-56',
}: {
  points: Point[];
  /** средний чек всего отрезка: линия уровня */
  avg: number;
  currency: string;
  compare: boolean;
  className?: string;
  height?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const data = points.map((p) => ({
    ...p,
    avgCheck: p.avgCheck > 0 ? p.avgCheck : null,
    prevAvgCheck: p.prevAvgCheck && p.prevAvgCheck > 0 ? p.prevAvgCheck : null,
  }));
  const empty = data.every((p) => p.avgCheck === null);

  const config = {
    avgCheck: { label: c.avgCheck, color: 'var(--chart-1)' },
    prevAvgCheck: { label: c.series.prev, color: 'var(--chart-2)' },
  } satisfies ChartConfig;

  return (
    <ChartPanel
      className={className}
      title={c.avgCheck}
      description={c.avgCheckNote}
      status={empty ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height={height}
      actions={avg > 0 && <span className="num text-xs text-muted-foreground">{c.average} {money(avg)}</span>}
    >
      <ChartContainer config={config} className={cn('aspect-auto w-full', height)}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} tick={{ fontSize: 11 }} />
          <YAxis
            width={44}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => compactNumber(v)}
            domain={['auto', 'auto']}
          />
          {avg > 0 && <ReferenceLine y={avg} stroke="var(--chart-4)" strokeDasharray="3 3" />}
          <ChartTooltip
            cursor={{ stroke: 'var(--border)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return (
                <ChartTip
                  title={p.label}
                  rows={[
                    { label: c.avgCheck, value: p.avgCheck === null ? '—' : money(p.avgCheck), color: 'var(--chart-1)' },
                    ...(compare && p.prevAvgCheck !== null
                      ? [{ label: c.series.prev, value: money(p.prevAvgCheck), color: 'var(--chart-2)', muted: true }]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="avgCheck"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={{ r: 2.5, strokeWidth: 0, fill: 'var(--chart-1)' }}
            activeDot={{ r: 4 }}
            isAnimationActive={false}
            connectNulls
          />
          {compare && (
            <Line
              type="monotone"
              dataKey="prevAvgCheck"
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </LineChart>
      </ChartContainer>
    </ChartPanel>
  );
}
