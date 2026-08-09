import type { CSSProperties, ReactNode } from 'react';

/**
 * Табло — язык приложения, перенесённый в веб.
 *
 * Экран собирается не из карточек с заголовками, а из приборов: одно
 * показание крупной цифрой сверху, под ним плитки со свечением, под ними
 * журнал строками. Разница не в оформлении. Карточка требует прочитать
 * заголовок, чтобы понять, что внутри; прибор отвечает раньше чтения —
 * размером, цветом и местом.
 *
 * Здесь только форма. Что показывать и как считать — дело страниц.
 */

export type Tone = 'violet' | 'teal' | 'amber' | 'lime' | 'slate';

/**
 * Плитка со свечением.
 *
 * Заливка тона плюс радиальное пятно из угла — то же, что рисует
 * `View.tile(_:)` в приложении. Тона одинаковы в обеих темах: плитка
 * это прибор на панели, он светится и днём, и ночью.
 */
export function Tile({
  tone = 'slate',
  label,
  value,
  note,
  wide,
  children,
}: {
  tone?: Tone;
  label: string;
  value?: ReactNode;
  note?: ReactNode;
  /** во всю ширину: для показания, которое не влезает в половину */
  wide?: boolean;
  children?: ReactNode;
}) {
  const ink = tone === 'lime' ? 'var(--tone-ink-on-lime)' : 'var(--tone-ink)';
  const style: CSSProperties = {
    background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, var(--tone-${tone}-glow) 28%, transparent) 0%, transparent 62%), var(--tone-${tone})`,
    color: ink,
  };

  return (
    <div
      className={`rounded-[22px] p-4 ${wide ? 'col-span-2' : ''}`}
      style={style}
    >
      <div className="text-[11.5px] font-medium opacity-70">{label}</div>
      {value !== undefined && (
        <div className="num mt-1 text-[26px] leading-none font-bold tracking-tight">{value}</div>
      )}
      {note !== undefined && <div className="num mt-1.5 text-[12px] opacity-70">{note}</div>}
      {children}
    </div>
  );
}

/**
 * Показание — то, ради чего экран открывают.
 *
 * По центру и крупно, без карточки вокруг: у прибора нет рамки. Над
 * цифрой — что это, под цифрой — сравнение. Больше на этой высоте ничего
 * быть не должно, иначе глазу приходится выбирать, куда смотреть первым.
 */
export function Reading({
  caption,
  value,
  compare,
  tone,
}: {
  caption: ReactNode;
  value: ReactNode;
  compare?: ReactNode;
  /** окраска сравнения: рост, падение или молчание */
  tone?: 'good' | 'warn';
}) {
  const compareColor =
    tone === 'good'
      ? 'var(--good-on-board)'
      : tone === 'warn'
        ? 'var(--warn-on-board)'
        : 'var(--board-muted)';

  return (
    <div className="flex flex-col items-center pt-2 pb-3 text-center">
      <div className="text-[13px] font-medium" style={{ color: 'var(--board-muted)' }}>
        {caption}
      </div>
      {/* Разряды разделены узким пробелом, и трекинг здесь не трогаем:
          отрицательный схлопывает группы в одно число. */}
      <div
        className="num mt-1 text-[clamp(40px,11vw,54px)] leading-none font-bold"
        style={{ color: 'var(--on-board)' }}
      >
        {value}
      </div>
      {compare !== undefined && (
        <div
          className="num mt-2.5 rounded-full px-3 py-1 text-[12.5px] font-semibold"
          style={{ color: compareColor, background: 'color-mix(in srgb, currentColor 12%, transparent)' }}
        >
          {compare}
        </div>
      )}
    </div>
  );
}

/**
 * Плитка человека — его цветом.
 *
 * Цвет берётся из имени, тот же самый, что в ленте и на смене: на листе
 * зарплат он превращает стопку одинаковых карточек в список людей. Тон
 * строится из одного цвета — тёмная заливка и он же свечением, — чтобы
 * не заводить вторую палитру рядом с существующей.
 */
export function PersonTile({
  color,
  children,
}: {
  color: string;
  children: ReactNode;
}) {
  return (
    <div
      className="rounded-[22px] p-4 text-white"
      style={{
        background: `radial-gradient(120% 120% at 100% 0%, color-mix(in srgb, ${color} 40%, transparent) 0%, transparent 62%), color-mix(in srgb, ${color} 45%, #0d0d10)`,
      }}
    >
      {children}
    </div>
  );
}

/** Сетка плиток: две колонки, как в приложении. */
export function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-2.5">{children}</div>;
}

/**
 * Журнал — строками, без карточек.
 *
 * Карточка вокруг каждой записи делает сорок машин сорока предметами.
 * Строка с волосяной линией между — это список, который читают сверху
 * вниз, а не разглядывают.
 */
export function Journal({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <div className="mt-4">
      <div className="flex items-center justify-between px-1.5 pb-1.5">
        <span className="text-[13px] font-semibold" style={{ color: 'var(--board-muted)' }}>
          {title}
        </span>
        {count !== undefined && (
          <span className="num text-[12px]" style={{ color: 'var(--board-muted)' }}>
            {count}
          </span>
        )}
      </div>
      <div className="board-journal">{children}</div>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div className="flex items-center gap-2.5 px-1.5 py-2.5">{children}</div>;
}
