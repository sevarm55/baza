import type { ReactNode } from 'react';
import Link from 'next/link';
import { NumericText } from '@/components/patterns/numeric-text';

/**
 * Приборы витрины: панель, плита итога и полоса слагаемых.
 *
 * Это остаток прежнего табло (`components/board.tsx`), который нужен
 * только показу на витрине: кабинет переехал на новые приборы
 * (`components/patterns/*`), а витрина осталась прежней и рисуется
 * прежними классами. Стили этих классов лежат в `landing-legacy.css`
 * и действуют только внутри `.landing`.
 */

/** Прибор с заголовком: подложка чернилами полотна, без рамки и тени. */
export function Panel({
  id,
  title,
  count,
  actions,
  children,
  className = '',
  bare,
}: {
  id?: string;
  title?: string;
  count?: number;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  /** без подложки: когда прибор уже стоит внутри другого */
  bare?: boolean;
}) {
  return (
    <section
      id={id}
      className={`flex min-w-0 flex-col ${bare ? '' : 'panel-pad rounded-[var(--radius-card)]'} ${className}`}
      style={bare ? undefined : { background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
    >
      {title !== undefined && (
        <div className="mb-4 flex min-h-[1.75rem] flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2
            className="flex items-baseline gap-2 text-[14px] font-semibold tracking-[-0.01em]"
            style={{ color: 'var(--on-board)' }}
          >
            {title}
            {count !== undefined && (
              <span className="num text-[12.5px] font-normal" style={{ color: 'var(--board-muted)' }}>
                {count}
              </span>
            )}
          </h2>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * Плита: одно число, ради которого экран открывают.
 * Знак красит само число, заливка плиты не меняется.
 */
export function Plate({
  label,
  value,
  note,
  sign,
}: {
  label: ReactNode;
  value: string;
  note?: ReactNode;
  sign?: 'good' | 'bad';
}) {
  return (
    <div
      className="plate"
      data-bad={sign === 'bad' ? '' : undefined}
      data-good={sign === 'good' ? '' : undefined}
    >
      <span className="plate-label">{label}</span>
      <span className="plate-value">
        <NumericText>{value}</NumericText>
      </span>
      {note !== undefined && <span className="plate-note">{note}</span>}
    </div>
  );
}

export type Figure = {
  label: string;
  value: string;
  /** знак связи с предыдущим слагаемым: видно, что из чего вычитается */
  sign?: '−' | '+';
  note?: string;
  /** слагаемое, за которым стоит свой раздел */
  href?: string;
};

/** Слагаемые одной полосой, а не карточками поштучно. */
export function Figures({ items }: { items: Figure[] }) {
  return (
    <div className="figures">
      {items.map((f) => {
        const body = (
          <>
            <div className="figure-value">
              {f.sign && (
                <span className="figure-sign" aria-hidden>
                  {f.sign}
                </span>
              )}
              <NumericText>{f.value}</NumericText>
            </div>
            <div className="figure-label">{f.label}</div>
            {f.note && <div className="figure-note num">{f.note}</div>}
          </>
        );

        return f.href ? (
          <Link key={f.label} href={f.href} className="figure figure-open">
            {body}
          </Link>
        ) : (
          <div key={f.label} className="figure">
            {body}
          </div>
        );
      })}
    </div>
  );
}
