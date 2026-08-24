'use client';

import type { ComponentProps, ReactNode } from 'react';

import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';

/**
 * Главная кнопка экрана: лайм под тёмным текстом, во всю ширину.
 *
 * Заливка сплошная, не стеклянная, и это не упущение: единственное
 * действие экрана обязано выглядеть одинаково всегда, иначе перестаёт
 * читаться кнопкой.
 *
 * Занято и погашено — разные состояния, и выглядят они по-разному.
 * Погашенная кнопка говорит «сейчас нельзя» и бледнеет; занятая
 * остаётся в полном цвете и показывает, ЧТО делает: слово отвечает на
 * вопрос, который человек задал нажатием, а один индикатор говорит
 * только «что-то идёт».
 *
 * Пятьдесят четыре точки высоты — не «покрупнее для телефона», а
 * ровно `padding(.vertical, 17)` из приложения вокруг строки в 17
 * пунктов. По ней попадают мокрым большим пальцем с первого раза.
 */
const TONE = {
  lime: 'bg-lime text-lime-foreground',
  grape: 'bg-primary text-primary-foreground',
  quiet: 'bg-m-inset text-m-ink',
  danger: 'bg-destructive text-destructive-foreground',
} as const;

type Tone = keyof typeof TONE;

export function MobileButton({
  children,
  tone = 'lime',
  loading = false,
  busyTitle,
  className,
  disabled,
  size = 'lg',
  ...rest
}: ComponentProps<'button'> & {
  tone?: Tone;
  loading?: boolean;
  /** «Записываем…», «Сохраняем…» — что именно идёт */
  busyTitle?: ReactNode;
  size?: 'lg' | 'md';
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(base(tone, size, Boolean(disabled)), className)}
    >
      <Body loading={loading} busyTitle={busyTitle}>
        {children}
      </Body>
    </button>
  );
}

function base(tone: Tone, size: 'lg' | 'md', disabled: boolean) {
  return cn(
    'm-press relative flex w-full items-center justify-center gap-2 rounded-m-card text-center font-bold',
    'outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-m-board',
    size === 'lg' && 'min-h-[54px] px-5 text-[17px]',
    size === 'md' && 'min-h-[46px] px-4 text-[15px]',
    TONE[tone],
    /* Погашенная кнопка бледнеет и не принимает касание — но остаётся
       на месте: причина видна на самом экране, и окошко с отказом не
       нужно. */
    disabled && 'pointer-events-none opacity-45',
  );
}

function Body({
  loading,
  busyTitle,
  children,
}: {
  loading: boolean;
  busyTitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      {/* Содержимое остаётся на месте и гаснет: подменить текст
          индикатором значит поменять ширину кнопки под пальцем и
          потерять то, на что человек только что нажал. */}
      <span className={cn('flex min-w-0 items-center gap-2 truncate', loading && 'opacity-0')}>
        {children}
      </span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center gap-2 px-4">
          <Spinner className="size-[19px]" />
          {busyTitle && <span className="truncate text-[15px] font-bold">{busyTitle}</span>}
        </span>
      )}
    </>
  );
}

/**
 * Чип: выбор одного из немногих.
 *
 * Класс машины, способ оплаты в фильтре, «только я / вместе». Выбранный
 * заливается, невыбранный лежит на вдавленной подложке — цвет несёт
 * ровно одно: который выбран.
 */
export function MobileChip({
  children,
  selected = false,
  tone = 'lime',
  className,
  ...rest
}: ComponentProps<'button'> & { selected?: boolean; tone?: 'lime' | 'ink' }) {
  return (
    <button
      type="button"
      {...rest}
      aria-pressed={selected}
      className={cn(
        'm-press inline-flex min-h-[38px] shrink-0 items-center justify-center gap-1.5 rounded-m-pill px-3 text-[12.5px] font-semibold',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        selected
          ? tone === 'lime'
            ? 'bg-lime text-lime-foreground'
            : 'bg-m-ink text-m-board'
          : 'bg-m-chip text-m-muted',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Тихое действие строкой: «дать скидку», «повторить», «убрать».
 *
 * Без заливки и без рамки: на экране уже есть главное действие, и
 * второй прямоугольник рядом с ним спорил бы за внимание.
 */
export function MobileQuietButton({
  children,
  className,
  tone = 'grape',
  ...rest
}: ComponentProps<'button'> & { tone?: 'grape' | 'muted' | 'danger' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'm-press inline-flex min-h-[38px] items-center gap-1.5 rounded-m-pill px-2 text-[14px] font-semibold',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        tone === 'grape' && 'text-primary',
        tone === 'muted' && 'text-m-muted',
        tone === 'danger' && 'text-destructive',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Полоса действия внизу экрана.
 *
 * Прибита к низу, над полосой вкладок, с полем под домашнюю черту.
 * Сверху короткий градиент: список должен уходить под кнопку, а не
 * обрываться под ней ножом.
 */
export function MobileActionBar({
  children,
  className,
  /** экран без вкладок (лист, форма): полоса садится на самый низ */
  bare = false,
}: {
  children: ReactNode;
  className?: string;
  bare?: boolean;
}) {
  return (
    <div
      data-slot="m-actionbar"
      className={cn('fixed inset-x-0 z-30 md:hidden', className)}
      style={{
        bottom: bare ? 'var(--m-safe-bottom)' : 'var(--m-bottom-inset)',
        paddingBottom: '10px',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none h-5 bg-gradient-to-b from-transparent to-m-board"
      />
      <div className="m-pad-x flex flex-col gap-2 bg-m-board pt-1">{children}</div>
    </div>
  );
}
