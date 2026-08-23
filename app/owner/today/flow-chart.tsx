'use client';

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';
import { EmptyState } from '@/components/patterns/states';
import type { FlowPoint } from './model';

/**
 * Ход периода: приход по часам (сегодня) или по дням (месяц).
 *
 * Отвечает на один вопрос: когда был заезд. Столбик текущего часа
 * выделен, пустые часы остаются пустыми, и провал между утром и
 * вечером виден как провал. Подсказка называет деньги, машины и
 * людей, которые их мыли.
 */
export function FlowChart({
  points,
  currency,
  unitOne,
  byHour,
}: {
  points: FlowPoint[];
  currency: string;
  unitOne: string;
  byHour: boolean;
}) {
  const t = useT();
  const max = Math.max(0, ...points.map((p) => p.value));

  if (max === 0) {
    return (
      <EmptyState
        compact
        title={byHour ? t.owner.emptyToday : t.today.noRecords}
        className="min-h-56"
      />
    );
  }

  const config = {
    value: { label: t.owner.revenue, color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Подписи оси: у дня каждый второй час, у месяца каждый пятый день,
     чтобы цифры не слипались на узком экране. */
  const step = byHour ? (points.length > 12 ? 2 : 1) : points.length > 16 ? 5 : 2;

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={points} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
        <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          interval={0}
          tick={{ fontSize: 11 }}
          tickFormatter={(value: string, index: number) =>
            index % step === 0 || points[index]?.now ? value : ''
          }
        />
        <YAxis
          hide={false}
          width={44}
          tickLine={false}
          axisLine={false}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) => compact(v)}
          allowDecimals={false}
        />
        <ChartTooltip
          cursor={{ fill: 'var(--muted)' }}
          content={({ active, payload }) => (
            <FlowTip
              active={!!active}
              point={(payload?.[0]?.payload as FlowPoint | undefined) ?? null}
              money={money}
              unitOne={unitOne}
              byHour={byHour}
            />
          )}
        />
        <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={40}>
          {points.map((p, i) => (
            <Cell
              key={`${p.label}-${i}`}
              fill={p.now ? 'var(--chart-1)' : p.value > 0 ? 'var(--chart-2)' : 'var(--chart-5)'}
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

/** «12 000» → «12k»: ось не должна занимать половину ширины. */
function compact(n: number): string {
  if (n >= 1_000_000) return `${Math.round(n / 100_000) / 10}M`;
  if (n >= 1_000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

function FlowTip({
  active,
  point,
  money,
  unitOne,
  byHour,
}: {
  active: boolean;
  point: FlowPoint | null;
  money: (n: number) => string;
  unitOne: string;
  byHour: boolean;
}) {
  const t = useT();
  if (!active || !point) return null;
  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground">
      <div className="mb-1 flex items-center justify-between gap-3 text-muted-foreground">
        <span>{byHour ? `${point.label}` : `${point.label}`}</span>
        {point.now && <span className="text-primary">{t.today.nowMark}</span>}
      </div>
      <div className="num text-sm font-semibold">{money(point.value)}</div>
      <div className="num text-muted-foreground">{unitCount(point.count, unitOne, t.locale)}</div>
      {point.people.length > 0 && (
        <div className="mt-1 truncate text-muted-foreground">{point.people.join(' · ')}</div>
      )}
    </div>
  );
}
