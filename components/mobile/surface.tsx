import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Поверхность мобильного слоя — одна на всё.
 *
 * Лист белый, и предметы на нём держит не граница, а тон: сиреневая
 * подложка в четыре процента. Рамок в системе нет намеренно — рамка на
 * белом делит экран на коробки, а тон оставляет его листом.
 *
 * Тонов ровно четыре, и каждый значит своё:
 * `quiet` — обычная плитка, «вот число»;
 * `grape` — плитка, которая говорит «сделай это» или «это главное»;
 * `lime` — «здесь и сейчас», ровно одна на экран;
 * `plain` — белая с волосяной гранью, для длинных списков, где сплошная
 * подложка съела бы весь лист.
 */
export type MTone = 'quiet' | 'grape' | 'lime' | 'plain';

/** Классы поверхности одной строкой — их нужно знать и ссылке, и кнопке. */
export function mSurface(
  tone: MTone = 'quiet',
  radius: 'card' | 'tile' | 'row' = 'tile',
  padded = true,
) {
  return cn(
    'flex min-w-0 flex-col',
    radius === 'card' && 'rounded-m-card',
    radius === 'tile' && 'rounded-m-tile',
    radius === 'row' && 'rounded-m-row',
    tone === 'quiet' && 'bg-m-tile text-m-ink',
    tone === 'grape' && 'bg-m-grape text-white',
    tone === 'lime' && 'bg-m-lime text-[#170b2b]',
    tone === 'plain' && 'border border-m-hair bg-m-bg text-m-ink',
    padded && 'p-4',
  );
}

export function MTile({
  children,
  className,
  tone = 'quiet',
  radius = 'tile',
  padded = true,
  as: Tag = 'div',
}: {
  children: ReactNode;
  className?: string;
  tone?: MTone;
  radius?: 'card' | 'tile' | 'row';
  padded?: boolean;
  as?: 'div' | 'section' | 'article' | 'li';
}) {
  return (
    <Tag data-slot="m-tile" data-tone={tone} className={cn(mSurface(tone, radius, padded), className)}>
      {children}
    </Tag>
  );
}

/**
 * Сетка плиток: две в ряд, одинаковой высоты.
 *
 * Две, а не три: в плитке живёт число в двадцать четыре пункта, и на
 * трёхстах семидесяти пяти точках третья колонка отняла бы у него
 * разряды.
 */
export function MGrid({
  children,
  className,
  cols = 2,
}: {
  children: ReactNode;
  className?: string;
  cols?: 2 | 3;
}) {
  return (
    <div
      className={cn('grid gap-2.5', cols === 2 ? 'grid-cols-2' : 'grid-cols-3', className)}
    >
      {children}
    </div>
  );
}

/**
 * Круглый значок категории — единственная круглая вещь в системе, кроме
 * лиц людей и точек состояния.
 *
 * Заливка тона, значок в нём; лаймовый вариант помечает то, что
 * происходит прямо сейчас. Цветной радуги категорий здесь нет: цвет в
 * этой системе принадлежит марке, а не списку разделов.
 */
export function MBadge({
  icon: Icon,
  tone = 'grape',
  size = 'md',
  className,
}: {
  icon: ComponentType<{ className?: string; strokeWidth?: number; 'aria-hidden'?: boolean }>;
  tone?: 'grape' | 'lime' | 'ink' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full',
        size === 'md' ? 'size-9' : 'size-7',
        tone === 'grape' && 'bg-m-grape/12 text-m-grape',
        tone === 'lime' && 'bg-m-lime text-[#170b2b]',
        tone === 'ink' && 'bg-m-grape text-white',
        tone === 'ghost' && 'bg-white/18 text-current',
        className,
      )}
    >
      <Icon aria-hidden className={size === 'md' ? 'size-[18px]' : 'size-[15px]'} strokeWidth={2} />
    </span>
  );
}

/**
 * Стрелка «открыть» в углу плитки.
 *
 * Из референса и по делу: плитка со стрелкой ведёт на экран, плитка без
 * стрелки — только показывает. Обещание, которое нельзя нарушать.
 */
export function MArrow({ className, tone = 'quiet' }: { className?: string; tone?: 'quiet' | 'on-dark' }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-7 shrink-0 items-center justify-center rounded-full',
        tone === 'quiet' ? 'bg-m-grape/10 text-m-grape' : 'bg-white/20 text-current',
        className,
      )}
    >
      <ArrowUpRight className="size-4" strokeWidth={2.25} />
    </span>
  );
}

/**
 * Плитка показателя: значок, стрелка, подпись, число.
 *
 * Порядок сверху вниз — значок, подпись, число — а не наоборот: глаз
 * идёт по плитке сверху, и последним, самым крупным, должен остаться
 * ответ.
 */
export function MStatTile({
  icon,
  label,
  value,
  note,
  dot,
  href,
  tone = 'quiet',
  badgeTone,
  className,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: ReactNode;
  value: ReactNode;
  /** приписка под числом: «12 машин», «доля 28 %» */
  note?: ReactNode;
  /** точка цвета куска полосы: плитка объясняет, чей это кусок */
  dot?: string;
  href?: string;
  tone?: 'quiet' | 'grape' | 'lime';
  badgeTone?: 'grape' | 'lime' | 'ink' | 'ghost';
  className?: string;
}) {
  const dark = tone === 'grape';
  /* Значок сверху, ответ снизу, и между ними пустота, а не воздух,
     распределённый поровну: у соседних плиток числа обязаны стоять на
     одной высоте, даже когда у одной есть приписка, а у другой нет. */
  const body = (
    <>
      {(icon || href) && (
        <div className="mb-3 flex items-start justify-between gap-2">
          {icon ? (
            <MBadge icon={icon} tone={badgeTone ?? (dark ? 'ghost' : tone === 'lime' ? 'ink' : 'grape')} />
          ) : (
            <span />
          )}
          {href && <MArrow tone={dark ? 'on-dark' : 'quiet'} />}
        </div>
      )}
      <div className="mt-auto flex min-w-0 flex-col">
        <div
          className={cn(
            'flex items-center gap-1.5 text-[length:var(--m-t-note)] leading-tight font-medium',
            dark ? 'text-white/70' : tone === 'lime' ? 'text-[#170b2b]/65' : 'text-m-muted',
          )}
        >
          {dot && (
            <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />
          )}
          <span className="truncate">{label}</span>
        </div>
        <div className="num mt-1 truncate text-[length:var(--m-t-stat)] leading-tight font-bold tracking-[-0.02em]">
          {value}
        </div>
        {note && (
          <div
            className={cn(
              'num mt-1 truncate text-[11.5px] leading-tight',
              dark ? 'text-white/60' : tone === 'lime' ? 'text-[#170b2b]/60' : 'text-m-faint',
            )}
          >
            {note}
          </div>
        )}
      </div>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        data-slot="m-tile"
        className={cn(
          mSurface(tone, 'tile'),
          'm-press outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40',
          className,
        )}
      >
        {body}
      </Link>
    );
  }

  return (
    <MTile tone={tone} className={className}>
      {body}
    </MTile>
  );
}
