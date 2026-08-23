'use client';

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { ChartTip } from '@/components/patterns/chart-panel';
import { EmptyState } from '@/components/patterns/states';
import { useA } from '@/lib/i18n/admin/client';

/** Маленький столбиковый график для обзора: подпись и число, без легенды. */
export function MiniBars({ data, height = 'h-40' }: { data: { label: string; value: number }[]; height?: string }) {
  const a = useA();
  const config = { value: { label: a.common.total, color: 'var(--chart-1)' } } satisfies ChartConfig;
  if (data.every((d) => d.value === 0)) return <EmptyState compact title={a.common.empty} className={height} />;

  return (
    <ChartContainer config={config} className={`aspect-auto w-full ${height}`}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }} barCategoryGap="25%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={6} minTickGap={12} tick={{ fontSize: 11 }} />
        <YAxis width={28} tickLine={false} axisLine={false} tick={{ fontSize: 11 }} allowDecimals={false} />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload as { label: string; value: number };
            return <ChartTip title={p.label} rows={[{ label: a.common.total, value: p.value, color: 'var(--chart-1)' }]} />;
          }}
        />
        <Bar dataKey="value" fill="var(--chart-1)" radius={[3, 3, 0, 0]} maxBarSize={28} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  );
}
