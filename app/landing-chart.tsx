'use client';

import { useId, type CSSProperties } from 'react';
import type { DemoPoint } from './landing-demo';
import s from './landing.module.css';

/**
 * Ход периода: столбики — сколько за отрезок, линия — сколько накопилось.
 *
 * Разбор тот же, что у графика в кабинете, и по той же причине: столбики
 * блоками тянутся по ширине без искажений, а линию рисует SVG, где
 * толщину штриха держит `vector-effect`. Всё, чего здесь нет по
 * сравнению с кабинетом, — наведение: витрину листают, а не изучают.
 *
 * График один на обе композиции витрины. Разные у них только пропорции:
 * на компьютере он занимает остаток прибора, на телефоне стоит
 * отдельным блоком и рост ему задаёт `plot` — телефонная доля экрана
 * ничего общего с настольной не имеет, и график в сто двадцать точек
 * высотой на телефоне читается полосой, а не ходом дня.
 */
export function Chart({
  points,
  labels,
  plot,
}: {
  points: DemoPoint[];
  labels: { line: string; bar: string };
  /** рост поля графика в точках: телефону нужен свой */
  plot?: number;
}) {
  /* Заливка под линией называется по узлу, а не общим именем.
     Композиций на странице две, и обе рисуют график; один и тот же
     `id` на двух градиентах означает, что второй график берёт заливку
     первого, а после его удаления теряет её вовсе. */
  const fill = useId();
  const max = Math.max(...points.map((p) => p.revenue), 1);
  const peak = points.findIndex((p) => p.revenue === max);

  const running: number[] = [];
  points.reduce((sum, p) => {
    const next = sum + p.revenue;
    running.push(next);
    return next;
  }, 0);
  const total = running[running.length - 1] || 1;

  const W = 1000;
  const H = 100;
  const x = (i: number) => (points.length > 1 ? (i * W) / (points.length - 1) : W / 2);
  const y = (v: number) => H - (v / total) * (H - 6) - 3;

  /* Кривая, а не ломаная: накопление — величина непрерывная, и излом на
     каждом часе читался бы как рваные данные при ровных числах. */
  const line = running
    .map((v, i) => {
      if (i === 0) return `M${x(0)},${y(v)}`;
      const mid = (x(i - 1) + x(i)) / 2;
      return `C${mid},${y(running[i - 1])} ${mid},${y(v)} ${x(i)},${y(v)}`;
    })
    .join(' ');
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  /* Ключ пересобирает узлы при смене периода: без него линия не
     перерисовалась бы, а осталась бы от прошлого набора. */
  const shape = `${points.length}-${total}`;

  return (
    <div className={s.chart}>
      <div className={s.chartLegend}>
        <span>
          <i data-line aria-hidden />
          {labels.line}
        </span>
        <span>
          <i aria-hidden />
          {labels.bar}
        </span>
      </div>

      <div
        className={s.chartPlot}
        style={plot ? ({ '--chart-h': `${plot}px` } as CSSProperties) : undefined}
      >
        <div className={s.chartBars}>
          {points.map((p, i) => (
            <span
              key={`${p.label}-${i}`}
              className={s.chartBar}
              data-peak={i === peak ? '' : undefined}
              style={
                { height: `${Math.max(3, (p.revenue / max) * 72)}%`, '--i': i } as CSSProperties
              }
            />
          ))}
        </div>

        <svg
          className={s.chartLine}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path key={`a-${shape}`} className="day-area" d={area} fill={`url(#${fill})`} />
          <path
            key={`l-${shape}`}
            className="day-line"
            d={line}
            pathLength={1}
            fill="none"
            stroke="var(--accent-strong)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className={s.chartAxis}>
        {points.map((p, i) =>
          i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2) ? (
            <span key={p.label}>{p.label}</span>
          ) : null,
        )}
      </div>
    </div>
  );
}
