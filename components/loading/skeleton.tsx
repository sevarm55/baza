import type { CSSProperties, ReactNode } from 'react';

/**
 * Скелет: место прибора, пока едут данные.
 *
 * Не кружок. Кружок сообщает «ждите», скелет — «вот что сейчас
 * появится», и переход читается как продолжение, а не как пауза.
 *
 * Главное правило скелета — он повторяет разметку той страницы, на
 * которой стоит, а не «страницы кабинета вообще». Десять одинаковых
 * серых прямоугольников, за которыми появляется совсем другая
 * раскладка, хуже, чем пустой экран: страница на глазах перекладывается
 * заново, и это заметнее, чем отсутствие скелета.
 *
 * Поэтому здесь только детали, а не готовые экраны: у каждого раздела
 * свой `loading.tsx`, собранный из этих деталей по форме своей
 * страницы.
 */

/** Место прибора: тот же радиус и те же чернила, что у `Panel`. */
export function SkeletonCard({
  className = '',
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  return (
    <div
      className={`skeleton rounded-[var(--radius-card)] ${className}`}
      style={style}
      aria-hidden
    >
      {children}
    </div>
  );
}

/** Место строки текста. Высота задаётся классом, как у настоящей строки. */
export function SkeletonText({ className = '' }: { className?: string }) {
  return (
    <div
      className={`skeleton rounded-[4px] ${className}`}
      style={{ '--skeleton-fill': 'color-mix(in srgb, var(--board-ink) 9%, transparent)' } as CSSProperties}
      aria-hidden
    />
  );
}

/** Место лица человека. Единственное круглое место во всём скелете. */
export function SkeletonAvatar({ className = 'size-9' }: { className?: string }) {
  return <div className={`skeleton rounded-full ${className}`} aria-hidden />;
}

/**
 * Место строки списка: значок, название, число справа.
 *
 * Ширины подписей нарочно разные и заданы раз и навсегда, а не
 * случайно: случайная ширина меняется на каждой отрисовке, и скелет
 * начинает дёргаться сам по себе.
 */
const ROW_WIDTHS = ['w-28', 'w-36', 'w-24', 'w-32', 'w-40', 'w-28'];

export function SkeletonRow({ i = 0, avatar = false }: { i?: number; avatar?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      {avatar ? <SkeletonAvatar className="size-8 shrink-0" /> : <SkeletonText className="size-4 shrink-0" />}
      <SkeletonText className={`h-3.5 ${ROW_WIDTHS[i % ROW_WIDTHS.length]}`} />
      <SkeletonText className="ms-auto h-3.5 w-20" />
    </div>
  );
}

/** Место списка строк внутри прибора. */
export function SkeletonList({ rows = 4, avatar = false }: { rows?: number; avatar?: boolean }) {
  return (
    <div className="grid gap-3.5">
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonRow key={i} i={i} avatar={avatar} />
      ))}
    </div>
  );
}

/** Место таблицы: шапка тоньше и короче строк. */
export function SkeletonTable({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="panel-pad rounded-[var(--radius-card)]"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
      aria-hidden
    >
      <div className="mb-4 flex gap-4">
        {Array.from({ length: cols }, (_, c) => (
          <SkeletonText key={c} className={`h-3 ${c === 0 ? 'w-24' : 'w-16'}`} />
        ))}
      </div>
      <div className="grid gap-3.5">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="flex gap-4">
            {Array.from({ length: cols }, (_, c) => (
              <SkeletonText key={c} className={`h-3.5 ${c === 0 ? 'w-32' : 'w-14'}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Шапка раздела: заголовок, подпись под ним и управление справа.
 *
 * Стоит на каждой странице кабинета, поэтому вынесена сюда: без неё
 * каждый `loading.tsx` начинался бы с одних и тех же четырёх строк.
 */
export function SkeletonHead({ tools = true }: { tools?: boolean }) {
  return (
    <div className="page-head">
      <div className="grid gap-2">
        <SkeletonText className="h-6 w-40" />
        <SkeletonText className="h-3.5 w-24" />
      </div>
      {tools && <SkeletonText className="h-9 w-[240px] !rounded-[8px]" />}
    </div>
  );
}

/**
 * Место целой страницы, когда своей формы у неё пока нет.
 *
 * Запасной вариант, а не образец: страница, для которой не написали
 * свой скелет, получает хотя бы шапку и полосу приборов вместо пустоты.
 * Каждый раздел, который открывают чаще раза в неделю, обязан иметь
 * собственный `loading.tsx`.
 */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite">
      <SkeletonHead />
      <div className="grid gap-[var(--seam)]">
        {Array.from({ length: rows }, (_, i) => (
          <SkeletonCard key={i} className={i === 0 ? 'h-[136px]' : 'h-[180px]'} />
        ))}
      </div>
    </div>
  );
}
