'use client';

import { Cell, Pie, PieChart } from 'recharts';

import { ChartPanel, ChartTip } from '@/components/patterns/chart-panel';
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';
import { formatMoney } from '@/lib/money';
import type { PaymentRow } from '../model';

/**
 * Способы оплаты: кольцо и список с суммами. Кольцо отвечает «в каких
 * долях», список «сколько именно»; один без другого не читается.
 */
export function PaymentDonut({
  rows,
  currency,
  unitOne,
  className,
}: {
  rows: PaymentRow[];
  currency: string;
  unitOne: string;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  const config: ChartConfig = Object.fromEntries(rows.map((r) => [r.key, { label: r.label, color: r.color }]));

  return (
    <ChartPanel
      className={className}
      title={c.payments}
      description={c.paymentsNote}
      status={total === 0 ? 'empty' : 'ok'}
      emptyTitle={c.noData}
      height="h-56"
    >
      <div className="flex items-center gap-4">
        <ChartContainer config={config} className="aspect-square h-36 w-36 shrink-0">
          <PieChart>
            <ChartTooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as PaymentRow;
                return (
                  <ChartTip
                    title={p.label}
                    rows={[
                      { label: t.owner.revenue, value: money(p.revenue), color: p.color },
                      { label: c.share, value: `${p.share}%`, muted: true },
                      { label: unitCount(p.count, unitOne, t.locale), value: '', muted: true },
                    ]}
                  />
                );
              }}
            />
            <Pie
              data={rows}
              dataKey="revenue"
              nameKey="label"
              innerRadius={44}
              outerRadius={66}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {rows.map((r) => (
                <Cell key={r.key} fill={r.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <ul className="flex min-w-0 flex-1 flex-col gap-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-sm">
              <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              <span className="num text-xs text-muted-foreground">{r.share}%</span>
              <span className="num font-medium">{money(r.revenue)}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartPanel>
  );
}
