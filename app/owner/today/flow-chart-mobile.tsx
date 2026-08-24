'use client';

import { useRef, useState } from 'react';

import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { cn } from '@/lib/utils';
import type { FlowPoint } from './model';

/**
 * Ход периода на телефоне — столбики, а не линия.
 *
 * Линия показывает ХОД: как одно перетекает в другое. На мойке, где за
 * день пять машин и половина часов пустая, хода нет — получается почти
 * горизонтальная нитка с редкими иглами, а при одной машине пустая
 * рамка с точкой посередине. Владелец видит картинку и не понимает, что
 * это график.
 *
 * Столбики отвечают на вопрос, который у него есть на самом деле:
 * сколько и когда. Один столбик читается так же однозначно, как
 * двадцать четыре, и это главное свойство — экран не должен
 * разваливаться на маленьких числах, а у мойки они чаще больших.
 *
 * Столбик можно вести пальцем: под пальцем встаёт подпись «12:00 ·
 * 2 500 ֏». Без касания подписан пик — на экран, на который просто
 * смотрят, ответ обязан быть без действий.
 */
export function FlowChartMobile({
  points,
  currency,
  className,
}: {
  points: FlowPoint[];
  currency: string;
  className?: string;
}) {
  const t = useT();
  const field = useRef<HTMLDivElement>(null);
  /** Под пальцем. `null` — палец убран, подписан пик. */
  const [touched, setTouched] = useState<number | null>(null);

  if (points.length === 0) return null;

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const peak = Math.max(1, ...points.map((p) => p.value));
  const peakIndex = points.findIndex((p) => p.value === peak);
  const shown = touched ?? (peakIndex >= 0 ? peakIndex : 0);
  const caption = points[shown] ? `${points[shown].label} · ${money(points[shown].value)}` : '';

  /* Четыре отметки: начало, две внутри, конец. Позиции подобраны под
     места подписей, а не под номера точек. */
  const last = points.length - 1;
  const picks =
    last <= 3
      ? Array.from({ length: last + 1 }, (_, i) => i)
      : [0, Math.round(last * 0.375), Math.round(last * 0.625), last];

  /* Ведём палец, а не ловим нажатие: в одно из двадцати четырёх делений
     с первого раза не попасть, а провести и остановиться — можно. */
  const track = (clientX: number) => {
    const box = field.current?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const i = Math.floor(((clientX - box.left) / box.width) * points.length);
    setTouched(Math.min(Math.max(0, i), points.length - 1));
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-semibold text-m-muted">{t.today.peak}</span>
        <span
          className={cn(
            'num truncate text-[12.5px]',
            touched === null ? 'text-m-muted' : 'font-semibold text-m-ink',
          )}
        >
          {caption}
        </span>
      </div>

      <div
        ref={field}
        className="flex h-[94px] items-end gap-[3px] touch-pan-y"
        onPointerDown={(e) => track(e.clientX)}
        onPointerMove={(e) => {
          if (e.buttons > 0 || e.pointerType === 'touch') track(e.clientX);
        }}
        onPointerUp={() => setTouched(null)}
        onPointerLeave={() => setTouched(null)}
      >
        {points.map((point, i) => {
          const lit = touched === i && point.value > 0;
          return (
            <span
              key={`${point.label}-${i}`}
              className={cn(
                'block min-w-0 flex-1 rounded-[4px] transition-colors duration-150',
                lit
                  ? 'bg-gradient-to-b from-lime to-lime/55'
                  : 'bg-gradient-to-b from-m-ink/22 to-m-ink/11',
              )}
              /* Пустой час остаётся видимой полоской в три пикселя: ноль
                 значит «машин не было», а не «данных нет», и разница
                 между этими двумя вещами для владельца существенна. */
              style={{ height: `max(3px, ${(point.value / peak) * 94}px)` }}
            />
          );
        })}
      </div>

      <div className="flex">
        {picks.map((i, slot) => (
          <span
            key={`${i}-${slot}`}
            className={cn(
              'num min-w-0 flex-1 truncate text-[11px] text-m-muted/85',
              slot === 0 ? 'text-left' : slot === picks.length - 1 ? 'text-right' : 'text-center',
            )}
          >
            {points[i]?.label ?? ''}
          </span>
        ))}
      </div>
    </div>
  );
}
