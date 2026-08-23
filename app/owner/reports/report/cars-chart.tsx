'use client';

import { Bar, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartPanel, ChartTip } from '@/components/patterns/chart-panel';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { useT } from '@/lib/i18n/client';
import { unitCount, unitForms } from '@/lib/i18n/terms';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { Point } from '../model';

/**
 * Машины по отрезку: столбики по дням (или часам), средняя линия и
 * предыдущий отрезок пунктиром. Отдельно от денег намеренно: число машин
 * и выручка отличаются в тысячу раз, и в одних осях одно из них ляжет
 * на ноль.
 */
export function CarsChart({
  points,
  unitOne,
  compare,
  className,
  height = 'h-56',
}: {
  points: Point[];
  unitOne: string;
  compare: boolean;
  className?: string;
  height?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const total = points.reduce((s, p) => s + p.count, 0);
  const filled = points.filter((p) => p.count > 0).length;
  const avg = filled > 0 ? Math.round((total / points.length) * 10) / 10 : 0;
  const empty = total === 0;

  const config = {
    count: { label: unitForms(unitOne, t.locale).many, color: 'var(--chart-1)' },
    prevCount: { label: c.series.prev, color: 'var(--chart-2)' },
  } satisfies ChartConfig;

  return (
    <ChartPanel
      className={className}
      title={c.cars}
      description={c.carsNote}
      status={empty ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height={height}
      actions={
        !empty && (
          <span className="num text-xs text-muted-foreground">
            {c.average} {avg}
          </span>
        )
      }
    >
      <ChartContainer config={config} className={cn('aspect-auto w-full', height)}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap="30%">
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={18} tick={{ fontSize: 11 }} />
          <YAxis width={32} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
          {avg > 0 && <ReferenceLine y={avg} stroke="var(--chart-4)" strokeDasharray="3 3" />}
          <ChartTooltip
            cursor={{ fill: 'var(--muted)' }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as Point;
              return (
                <ChartTip
                  title={p.label}
                  rows={[
                    { label: unitForms(unitOne, t.locale).many, value: p.count, color: 'var(--chart-1)' },
                    ...(compare && p.prevCount !== null
                      ? [{ label: c.series.prev, value: p.prevCount, color: 'var(--chart-2)', muted: true }]
                      : []),
                    { label: t.owner.revenue, value: formatMoney(p.revenue, undefined, t.locale), muted: true },
                  ]}
                />
              );
            }}
          />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
          {compare && (
            <Line
              type="monotone"
              dataKey="prevCount"
              stroke="var(--chart-2)"
              strokeWidth={1.5}
              strokeDasharray="4 4"
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          )}
        </ComposedChart>
      </ChartContainer>
      <p className="num mt-2 text-xs text-muted-foreground">{unitCount(total, unitOne, t.locale)}</p>
    </ChartPanel>
  );
}
