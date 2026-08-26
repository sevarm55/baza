'use client';

import Link from 'next/link';
import type { ComponentProps, ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Органы управления мобильного слоя.
 *
 * Размер один: пятьдесят две точки в высоту у всего, что нажимают
 * пальцем, и сорок у фишек. Это больше десктопных тридцати шести и
 * больше минимума в сорок четыре — телефон держат одной рукой, часто
 * мокрой, и промах здесь стоит записанной не той машины.
 */

type Tone = 'grape' | 'lime' | 'quiet' | 'ghost' | 'danger';

function buttonTone(tone: Tone) {
  return cn(
    tone === 'grape' && 'bg-m-grape text-white',
    tone === 'lime' && 'bg-m-lime text-[#170b2b]',
    tone === 'quiet' && 'bg-m-tile text-m-ink',
    tone === 'ghost' && 'text-m-grape',
    tone === 'danger' && 'bg-m-bad text-white',
  );
}

const BUTTON_BASE =
  'm-press relative inline-flex items-center justify-center gap-2 rounded-m-row px-5 text-[length:var(--m-t-field)] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-m-grape/40 disabled:pointer-events-none disabled:opacity-45';

/**
 * Кнопка. Главная на экране одна, и она грейповая или лаймовая.
 *
 * Лайм — не «ещё один яркий цвет», а метка «прямо сейчас»: им покрашено
 * действие, которое человек совершает по сорок раз за смену (записать
 * машину, раздать деньги). Всё остальное грейповое или тихое.
 */
export function MButton({
  children,
  className,
  tone = 'grape',
  size = 'lg',
  block,
  icon: Icon,
  ...rest
}: ComponentProps<'button'> & {
  tone?: Tone;
  size?: 'lg' | 'md';
  block?: boolean;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        BUTTON_BASE,
        buttonTone(tone),
        size === 'lg' ? 'h-[var(--m-control-h)]' : 'h-11 text-[15px]',
        block && 'w-full',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-[19px]" strokeWidth={2.2} />}
      {children}
    </button>
  );
}

/** Та же кнопка, но ведёт на экран. */
export function MButtonLink({
  children,
  className,
  tone = 'grape',
  size = 'lg',
  block,
  icon: Icon,
  ...rest
}: ComponentProps<typeof Link> & {
  tone?: Tone;
  size?: 'lg' | 'md';
  block?: boolean;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <Link
      {...rest}
      className={cn(
        BUTTON_BASE,
        buttonTone(tone),
        size === 'lg' ? 'h-[var(--m-control-h)]' : 'h-11 text-[15px]',
        block && 'w-full',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-[19px]" strokeWidth={2.2} />}
      {children}
    </Link>
  );
}

/**
 * Круглая кнопка со значком: назад, поиск, настройка, закрыть.
 *
 * Круг, а не квадрат: в шапке экрана это единственная форма, которая не
 * спорит с крупным заголовком рядом.
 */
export function MIconButton({
  icon: Icon,
  label,
  className,
  tone = 'quiet',
  ...rest
}: Omit<ComponentProps<'button'>, 'children'> & {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  /** подпись для читалки экрана: у кнопки со значком её нет иначе */
  label: string;
  tone?: 'quiet' | 'grape' | 'lime' | 'plain';
}) {
  return (
    <button
      type="button"
      aria-label={label}
      {...rest}
      className={cn(
        'm-press inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none',
        'focus-visible:ring-2 focus-visible:ring-m-grape/40',
        tone === 'quiet' && 'bg-m-tile text-m-ink',
        tone === 'grape' && 'bg-m-grape text-white',
        tone === 'lime' && 'bg-m-lime text-[#170b2b]',
        tone === 'plain' && 'border border-m-hair bg-m-bg text-m-ink',
        className,
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={2} />
    </button>
  );
}

/** Круглая кнопка-ссылка: стрелка «назад» в шапке. */
export function MIconLink({
  icon: Icon,
  label,
  className,
  tone = 'quiet',
  ...rest
}: Omit<ComponentProps<typeof Link>, 'children'> & {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  tone?: 'quiet' | 'grape' | 'lime' | 'plain';
}) {
  return (
    <Link
      aria-label={label}
      {...rest}
      className={cn(
        'm-press inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none',
        'focus-visible:ring-2 focus-visible:ring-m-grape/40',
        tone === 'quiet' && 'bg-m-tile text-m-ink',
        tone === 'grape' && 'bg-m-grape text-white',
        tone === 'lime' && 'bg-m-lime text-[#170b2b]',
        tone === 'plain' && 'border border-m-hair bg-m-bg text-m-ink',
        className,
      )}
    >
      <Icon aria-hidden className="size-5" strokeWidth={2} />
    </Link>
  );
}

/**
 * Фишка-пилюля: период, фильтр, класс машины, человек в бригаде.
 *
 * Единственное место системы, где разрешена капсула. Форма здесь
 * работает: фишка — это слово, которое можно нажать, и капсула
 * обнимает слово ровно так, как это нужно.
 *
 * Выбранная фишка грейповая целиком, а не обведённая: обводка на белом
 * листе теряется на солнце, заливка — никогда.
 */
const CHIP_BASE =
  'm-press inline-flex h-[var(--m-chip-h)] shrink-0 items-center justify-center gap-1.5 rounded-full px-4 text-[length:var(--m-t-row)] font-semibold whitespace-nowrap outline-none transition-colors focus-visible:ring-2 focus-visible:ring-m-grape/40';

export function MChip({
  children,
  selected,
  className,
  tone = 'grape',
  count,
  icon: Icon,
  ...rest
}: ComponentProps<'button'> & {
  selected?: boolean;
  tone?: 'grape' | 'lime';
  /** число справа от подписи: «Все · 23» */
  count?: ReactNode;
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...rest}
      className={cn(
        CHIP_BASE,
        selected
          ? tone === 'lime'
            ? 'bg-m-lime text-[#170b2b]'
            : 'bg-m-grape text-white'
          : 'bg-m-tile text-m-muted',
        className,
      )}
    >
      {Icon && <Icon aria-hidden className="size-[17px]" strokeWidth={2} />}
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'num rounded-full px-1.5 py-px text-[11.5px] font-bold',
            selected ? 'bg-white/22' : 'bg-m-grape/10 text-m-grape',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

/** Та же фишка ссылкой: период страницы живёт в адресе, а не в состоянии. */
export function MChipLink({
  children,
  selected,
  className,
  count,
  ...rest
}: ComponentProps<typeof Link> & { selected?: boolean; count?: ReactNode }) {
  return (
    <Link
      aria-current={selected ? 'page' : undefined}
      {...rest}
      className={cn(
        CHIP_BASE,
        selected ? 'bg-m-grape text-white' : 'bg-m-tile text-m-muted',
        className,
      )}
    >
      {children}
      {count !== undefined && (
        <span
          className={cn(
            'num rounded-full px-1.5 py-px text-[11.5px] font-bold',
            selected ? 'bg-white/22' : 'bg-m-grape/10 text-m-grape',
          )}
        >
          {count}
        </span>
      )}
    </Link>
  );
}

/**
 * Ряд фишек, который катится вбок.
 *
 * Уходит под края экрана намеренно: обрезанная фишка у правого края —
 * единственный честный признак, что ряд продолжается.
 */
export function MChipRow({
  children,
  className,
  ariaLabel,
}: {
  children: ReactNode;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role={ariaLabel ? 'group' : undefined}
      aria-label={ariaLabel}
      className={cn('m-rail -mx-4 flex gap-2 px-4', className)}
    >
      {children}
    </div>
  );
}

/**
 * Полоса действия, прибитая к низу экрана.
 *
 * Стоит над полосой вкладок и уважает домашнюю черту. Материал, а не
 * заливка: под ней должно быть видно, что список продолжается.
 */
export function MActionBar({
  children,
  className,
  lead,
}: {
  children: ReactNode;
  className?: string;
  /** итог слева от кнопки: сумма, число выбранных */
  lead?: ReactNode;
}) {
  return (
    <div
      data-slot="m-actionbar"
      className={cn('m-glass fixed inset-x-0 z-30 border-t border-m-hair md:hidden', className)}
      style={{ bottom: 0, paddingBottom: 'calc(var(--m-bottom-inset) + 8px)' }}
    >
      <div className="m-pad-x flex items-center gap-3 pt-2">
        {lead && <div className="min-w-0 flex-1">{lead}</div>}
        <div className={cn('flex items-center gap-2', lead ? 'shrink-0' : 'flex-1')}>{children}</div>
      </div>
    </div>
  );
}
