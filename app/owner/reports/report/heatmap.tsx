'use client';

import { useState } from 'react';

import { ChartPanel } from '@/components/patterns/chart-panel';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { HeatRow } from '../model';

/**
 * Загрузка по времени: день недели × час.
 *
 * Не график, а таблица с цветом: у мойки неделя имеет рельеф, и вопрос
 * «когда приезжают» отвечается взглядом на пятна, а не чтением цифр.
 * Цвет от числа машин, деньги в подсказке. Часы берутся от первого до
 * последнего, в котором хоть что-то было, но не уже 8…20: пустая клетка
 * в рабочий час тоже ответ.
 */
export function Heatmap({
  rows,
  weekdays,
  currency,
  unitOne,
  className,
}: {
  rows: HeatRow[];
  /** подписи дней недели, с понедельника */
  weekdays: string[];
  currency: string;
  unitOne: string;
  className?: string;
}) {
  const t = useT();
  const c = t.reports.charts;
  const [pick, setPick] = useState<HeatRow | null>(null);
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const total = rows.reduce((s, r) => s + r.count, 0);
  const hoursSeen = rows.filter((r) => r.count > 0).map((r) => r.hour);
  const start = Math.min(8, ...(hoursSeen.length ? hoursSeen : [8]));
  const end = Math.max(20, ...(hoursSeen.length ? hoursSeen : [20]));
  const hours = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const by = new Map(rows.map((r) => [`${r.dow}-${r.hour}`, r]));

  return (
    <ChartPanel
      className={className}
      title={c.heatmap}
      description={c.heatmapNote}
      status={total === 0 ? 'empty' : 'ok'}
      emptyTitle={c.heatmapEmpty}
      height="h-64"
      actions={
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.less}
          <span className="flex gap-0.5" aria-hidden>
            {[0.15, 0.35, 0.6, 0.85, 1].map((k) => (
              <span
                key={k}
                className="size-2.5 rounded-sm"
                style={{ background: `color-mix(in srgb, var(--primary) ${Math.round(k * 100)}%, var(--muted))` }}
              />
            ))}
          </span>
          {c.more}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <div
          className="grid min-w-[520px] gap-[3px]"
          style={{ gridTemplateColumns: `2.5rem repeat(${hours.length}, minmax(0, 1fr))` }}
          role="table"
          aria-label={c.heatmap}
        >
          <span aria-hidden />
          {hours.map((h) => (
            <span key={h} className="num text-center text-2xs text-muted-foreground" role="columnheader">
              {String(h).padStart(2, '0')}
            </span>
          ))}
          {weekdays.map((day, i) => {
            const dow = i + 1;
            return (
              <div key={dow} className="contents" role="row">
                <span className="flex items-center text-xs text-muted-foreground" role="rowheader">
                  {day}
                </span>
                {hours.map((h) => {
                  const cell = by.get(`${dow}-${h}`);
                  const k = cell ? cell.count / max : 0;
                  const on = pick === cell && !!cell;
                  return (
                    <button
                      key={h}
                      type="button"
                      role="cell"
                      aria-label={`${day} ${String(h).padStart(2, '0')}:00 · ${unitCount(cell?.count ?? 0, unitOne, t.locale)}`}
                      onMouseEnter={() => setPick(cell ?? null)}
                      onFocus={() => setPick(cell ?? null)}
                      onMouseLeave={() => setPick(null)}
                      onBlur={() => setPick(null)}
                      className={cn(
                        'num h-6 rounded-sm text-2xs outline-none transition-[box-shadow] focus-visible:ring-2 focus-visible:ring-ring/50',
                        on && 'ring-2 ring-primary',
                        k === 0 ? 'bg-muted text-transparent' : k > 0.55 ? 'text-primary-foreground' : 'text-foreground',
                      )}
                      style={
                        k > 0
                          ? { background: `color-mix(in srgb, var(--primary) ${Math.round(15 + k * 85)}%, var(--muted))` }
                          : undefined
                      }
                    >
                      {cell && cell.count > 0 ? cell.count : ''}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
      <div className="num mt-2 h-4 text-xs text-muted-foreground" aria-live="polite">
        {pick
          ? `${weekdays[pick.dow - 1]} ${String(pick.hour).padStart(2, '0')}:00 · ${unitCount(pick.count, unitOne, t.locale)} · ${money(pick.revenue)}`
          : unitCount(total, unitOne, t.locale)}
      </div>
    </ChartPanel>
  );
}
