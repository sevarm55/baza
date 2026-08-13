'use client';

import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart';

/**
 * График выручки на голом shadcn.
 *
 * Опыт нарочно бескомпромиссный: ничего своего, только `ChartContainer`
 * и Recharts, как в примерах библиотеки. Наш `DayChart` рисует линию
 * накопления поверх часового рельефа и держит подпись под полотном; здесь
 * — стандартная площадь с сеткой и всплывающей подсказкой, ровно то, что
 * даёт shadcn из коробки.
 *
 * Смысл сравнения не в том, какой красивее. Стандартный график отвечает
 * «сколько было в такой-то час», а наш — ещё и «сколько набежало к этому
 * часу»; вопрос, нужен ли второй ответ, и стоит ли он своего кода.
 */
const config = {
  value: { label: 'Հասույթ', color: 'var(--chart-1)' },
} satisfies ChartConfig;

export function RevenueChart({ points }: { points: { label: string; value: number }[] }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-[220px] w-full">
      <AreaChart data={points} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
        <defs>
          <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.8} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0.1} />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="natural"
          fill="url(#fillValue)"
          stroke="var(--color-value)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
