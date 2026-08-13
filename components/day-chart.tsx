'use client';

import { useState } from 'react';
import { formatMoney } from '@/lib/money';

export type ChartPoint = { label: string; value: number; peak?: boolean };
type SplitSegment = { label: string; value: number; color: string };

/**
 * Ход дня: сколько накопилось и когда пришло.
 *
 * Здесь два вопроса, и они разные. «Как идёт день» — это накопление:
 * линия растёт, и по её наклону видно, догоняет день вчерашний или
 * отстаёт. «Когда у меня заезд» — это рельеф: где столбик выше, туда и
 * приходят, а провал между ними и есть тот час, в который мойка стояла.
 *
 * Раньше был только рельеф. Он отвечал на второй вопрос и молчал про
 * первый: по стопке одинаковых палок нельзя сказать, сколько всего
 * набежало к трём часам. Теперь линия идёт поверх столбиков — один
 * прибор на оба вопроса, и ни один не пришлось выбрасывать.
 *
 * Линия рисуется в SVG, а столбики остаются блоками. Смешение нарочное:
 * растянутый по ширине SVG искажает толщину штриха, и лечится это
 * `vector-effect`, а вот прямоугольники блоками тянутся без искажений
 * вовсе и остаются чёткими на любом экране.
 */
export function DayChart({
  points,
  currency,
}: {
  points: ChartPoint[];
  currency: string;
}) {
  /* Что под курсором. `null` — курсора нет, и тогда подпись внизу
     показывает пик: экран, на который просто смотрят, обязан отвечать
     без наведения. */
  const [at, setAt] = useState<number | null>(null);

  if (points.length === 0) return null;

  const max = Math.max(...points.map((p) => p.value));
  const peakIndex = Math.max(0, points.findIndex((p) => p.value === max && max > 0));

  /* Накопление считается один раз и здесь: то же самое в разметке
     превратилось бы в сумму, пересчитываемую на каждой точке. */
  const running: number[] = [];
  points.reduce((sum, p) => {
    const next = sum + p.value;
    running.push(next);
    return next;
  }, 0);
  const total = running[running.length - 1] ?? 0;

  const W = 1000;
  const H = 260;
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const y = (v: number) => (total > 0 ? H - (v / total) * (H - 12) - 6 : H - 6);
  const x = (i: number) => (points.length > 1 ? i * step : W / 2);

  const line = running.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  const shown = at ?? peakIndex;
  const active = points[shown];

  const axis = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];

  return (
    <div className="mt-1 mb-1" aria-label="Հասույթի շարժը ժամանակի ընթացքում">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-[12px] font-medium" style={{ color: 'var(--board-muted)' }}>
            Մինչև հիմա
          </div>
          <div className="num mt-1 text-[clamp(28px,3vw,38px)] leading-none font-bold tracking-[-0.04em]">
            {formatMoney(total, currency)}
          </div>
        </div>
        <div className="flex items-center gap-4 text-[11.5px]" style={{ color: 'var(--board-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-5 rounded-full bg-[var(--tone-violet-glow)]" aria-hidden />
            Կուտակված
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-[color-mix(in_srgb,var(--board-ink)_16%,transparent)]" aria-hidden />
            Ժամում
          </span>
        </div>
      </div>

      <div
        className="relative h-[150px] cursor-crosshair lg:h-[210px]"
        onPointerLeave={() => setAt(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          const i = Math.round(ratio * (points.length - 1));
          setAt(Math.min(points.length - 1, Math.max(0, i)));
        }}
      >
        {/* Рельеф. Приглушён до фона: он подложка под линией, а не
            второй график — два одинаково громких слоя спорили бы за
            взгляд, и не читался бы ни один. */}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {points.map((p, i) => (
            <div
              key={`${p.label}-${i}`}
              className="flex-1 rounded-t-[3px] transition-opacity"
              style={{
                height: `${max > 0 ? Math.max(1.5, (p.value / max) * 74) : 1.5}%`,
                background: 'color-mix(in srgb, var(--board-ink) 13%, transparent)',
                opacity: at === null || at === i ? 1 : 0.45,
              }}
            />
          ))}
        </div>

        {/* Линия накопления. `preserveAspectRatio` снят, чтобы полотно
            тянулось по ширине блока; толщину штриха при этом держит
            `vector-effect` — иначе на широком экране линия расплывается
            в полосу. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--tone-violet-glow)" stopOpacity="0.34" />
              <stop offset="100%" stopColor="var(--tone-violet-glow)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Три линии сетки. Больше не нужно: точные значения даёт
              подсказка, а сетка тут только чтобы глаз держал высоту. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="color-mix(in srgb, var(--board-ink) 8%, transparent)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          <path d={area} fill="url(#dayFill)" />
          <path
            d={line}
            fill="none"
            stroke="var(--tone-violet-glow)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* Отвес и точка под курсором — блоками, а не в SVG: круг в
            растянутом полотне превратился бы в овал. */}
        {at !== null && points.length > 1 && (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{
                left: `${(at / (points.length - 1)) * 100}%`,
                background: 'color-mix(in srgb, var(--board-ink) 22%, transparent)',
              }}
            />
            <div
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(at / (points.length - 1)) * 100}%`,
                top: `${(y(running[at]) / H) * 100}%`,
                background: 'var(--tone-violet-glow)',
                boxShadow: '0 0 0 3px var(--board)',
              }}
            />
          </>
        )}
      </div>

      <div className="relative mt-2 h-4" aria-hidden>
        {axis.map((i) => (
          <span
            key={`${points[i]?.label}-${i}`}
            className="num absolute -translate-x-1/2 text-[11px]"
            style={{
              left: `${points.length > 1 ? (i / (points.length - 1)) * 100 : 50}%`,
              color: 'var(--board-muted)',
            }}
          >
            {points[i]?.label}
          </span>
        ))}
      </div>

      {/* Подпись под графиком — она же подсказка.

          Всплывающее окно поверх линии закрывало бы её собой на узком
          экране, и палец на телефоне закрывал бы вместе с ним. Строка
          под графиком стоит на месте, ничего не перекрывает и меняется
          на лету: без курсора показывает пик, под курсором — точку. */}
      <div className="mt-3 flex min-h-5 items-baseline justify-end gap-3 text-[12px]">
        {active && (max > 0 || at !== null) ? (
          <>
            <span className="num" style={{ color: 'var(--board-muted)' }}>{active.label}</span>
            <span className="num font-semibold" style={{ color: 'var(--on-board)' }}>
              ժամում +{formatMoney(active.value, currency)}
            </span>
            <span className="num" style={{ color: 'var(--board-muted)' }}>
              ընդամենը {formatMoney(running[shown] ?? 0, currency)}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--board-muted)' }}>Այսօր դեռ գրանցում չկա</span>
        )}
      </div>
    </div>
  );
}

export function PaymentSplit({
  segments,
  currency,
}: {
  segments: SplitSegment[];
  currency: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) return null;

  // крупное вперёд: доля наличных — то, ради чего сюда смотрят
  const visible = segments.filter((s) => s.value > 0).sort((a, b) => b.value - a.value);

  // подложку даёт страница: этот прибор ставят и внутрь другого
  return (
    <div>
      {/* Полоса долей — прямая. Скругление в 999 на ленте высотой в
          десять пикселей срезает крайние сегменты, и доля наличных
          выглядит меньше, чем она есть. */}
      <div className="mb-2.5 flex h-2 overflow-hidden rounded-[3px]">
        {visible.map((s) => (
          <div
            key={s.label}
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {visible.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[13.5px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: s.color }}
              aria-hidden
            />
            <span style={{ color: 'var(--board-muted)' }}>{s.label}</span>
            <span className="num font-semibold">{formatMoney(s.value, currency)}</span>
            <span className="num" style={{ color: 'var(--board-muted)', opacity: 0.8 }}>
              {Math.round((s.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
