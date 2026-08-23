'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts';

import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { Panel } from '@/components/patterns/panel';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { unitCount, unitForms } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import type { Metric, TrendPoint } from './model';

/**
 * Ход бизнеса по месяцам.
 *
 * Отвечает на то, ради чего отчёт открывают: лучше или хуже стало.
 * Разница в высоте столбиков видна раньше, чем прочитано первое число.
 *
 * Одна величина за раз, а не четыре линии сразу: выручка, зарплата и
 * итог отличаются в разы, и в одних осях меньшая легла бы на ноль.
 * Переключатель отвечает на три вопроса по очереди: сколько осталось,
 * сколько пришло, сколько машин.
 *
 * Столбики, а не линия: между июлем и августом ничего нет, и линия
 * обещала бы плавный переход, которого не существует. Открытый месяц
 * выделен, убыток уходит вниз от нулевой линии и красный.
 *
 * Нажатие по столбику открывает месяц. Клавиатуре служат переключатель
 * месяцев в шапке и ссылки в таблице внизу.
 */
export function Trend({
  points,
  currency,
  unitOne,
  className,
}: {
  /** от старого к новому: график читают слева направо, как время */
  points: TrendPoint[];
  currency: string;
  unitOne: string;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [metric, setMetric] = useState<Metric>('profit');

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const label = (n: number) => (metric === 'count' ? String(n) : money(n));

  const titles: Record<Metric, string> = {
    profit: t.owner.profit,
    revenue: t.owner.revenue,
    count: unitForms(unitOne, t.locale).many,
  };

  const data = points.map((p) => ({ ...p, value: p[metric] }));
  const empty = data.every((p) => p.value === 0);
  const hasLoss = data.some((p) => p.value < 0);

  const config = {
    value: { label: titles[metric], color: 'var(--chart-1)' },
  } satisfies ChartConfig;

  /* Нажатие ловится на всём столбце, а не только на прямоугольнике:
     у месяца с нулём прямоугольника нет, а открыть его всё равно можно. */
  const open = (state: { activeTooltipIndex?: number | string | null | undefined }) => {
    const i = Number(state.activeTooltipIndex ?? NaN);
    const p = Number.isInteger(i) ? points[i] : undefined;
    if (p && !p.current) router.push(p.href);
  };

  return (
    <Panel
      className={className}
      title={t.reports.trend}
      actions={
        <Segmented
          size="sm"
          label={t.reports.trend}
          current={metric}
          onSelect={(key) => setMetric(key as Metric)}
          items={[
            { key: 'profit', label: titles.profit },
            { key: 'revenue', label: titles.revenue },
            { key: 'count', label: titles.count },
          ]}
        />
      }
    >
      {empty ? (
        <EmptyState compact title={t.common.empty} className="min-h-56" />
      ) : (
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart
            data={data}
            margin={{ top: 8, right: 4, bottom: 0, left: 4 }}
            barCategoryGap="28%"
            onClick={open}
            className="cursor-pointer"
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              interval={0}
              tick={{ fontSize: 11 }}
            />
            <YAxis
              width={44}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 11 }}
              tickFormatter={(v: number) => (metric === 'count' ? String(v) : compact(v))}
              allowDecimals={false}
            />
            {/* Ноль всегда внутри шкалы: без него месяц с убытком
                рисовался бы столбиком вверх от собственного дна. */}
            {hasLoss && <ReferenceLine y={0} stroke="var(--border)" />}
            <ChartTooltip
              cursor={{ fill: 'var(--muted)' }}
              content={({ active, payload }) => (
                <TrendTip
                  active={!!active}
                  point={(payload?.[0]?.payload as TrendPoint | undefined) ?? null}
                  metric={metric}
                  label={label}
                  unitOne={unitOne}
                />
              )}
            />
            <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={48}>
              {data.map((p) => (
                <Cell
                  key={p.key}
                  fill={
                    p.value < 0
                      ? 'var(--destructive)'
                      : p.current
                        ? 'var(--chart-1)'
                        : 'var(--chart-2)'
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Panel>
  );
}

/** «12 000» → «12k»: ось не должна занимать половину ширины. */
function compact(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 100_000) / 10}M`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 1000)}k`;
  return `${sign}${abs}`;
}

/**
 * Подсказка к столбику: месяц, величина и, у денег, сколько машин
 * за ней стоит. Открытый месяц назван цветом бренда, как и его столбик.
 */
function TrendTip({
  active,
  point,
  metric,
  label,
  unitOne,
}: {
  active: boolean;
  point: TrendPoint | null;
  metric: Metric;
  label: (n: number) => string;
  unitOne: string;
}) {
  const t = useT();
  if (!active || !point) return null;
  const value = point[metric];
  return (
    <div className="min-w-36 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground">
      <div className={cn('mb-1 font-medium', point.current ? 'text-primary' : 'text-muted-foreground')}>
        {point.label}
      </div>
      <div className={cn('num text-sm font-semibold', value < 0 && 'text-destructive')}>
        {label(value)}
      </div>
      {metric !== 'count' && (
        <div className="num text-muted-foreground">{unitCount(point.count, unitOne, t.locale)}</div>
      )}
    </div>
  );
}
