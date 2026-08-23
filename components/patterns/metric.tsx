import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'primary';

const VALUE_TONE: Record<Tone, string> = {
  default: 'text-foreground',
  success: 'text-success',
  warning: 'text-warning',
  destructive: 'text-destructive',
  muted: 'text-muted-foreground',
  primary: 'text-primary',
};

/**
 * Показание: подпись мелким капсом, число крупно, строка пояснения.
 *
 * Кегль числа задаёт важность: `lg` для одного главного показателя
 * страницы, `md` для полосы KPI, `sm` для показаний внутри панелей.
 * Цвет числа по умолчанию чёрный; тон ставится только там, где знак
 * несёт смысл (убыток, долг, срок).
 */
export function Metric({
  label,
  value,
  hint,
  delta,
  tone = 'default',
  size = 'md',
  className,
  selected = false,
}: {
  label: ReactNode;
  value: ReactNode;
  /** пояснение под числом: «за 12 машин», «из 45 000» */
  hint?: ReactNode;
  /** сравнение: `<Delta …/>` или произвольная подпись */
  delta?: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** выбранный показатель: лаймовая метка слева */
  selected?: boolean;
}) {
  return (
    <div
      data-slot="metric"
      data-selected={selected || undefined}
      className={cn('flex min-w-0 flex-col gap-1', selected && 'border-l-2 border-lime pl-3', className)}
    >
      <div className="truncate text-2xs font-medium tracking-wider text-muted-foreground uppercase">
        {label}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div
          className={cn(
            'num min-w-0 leading-none font-semibold tracking-[-0.02em] break-words',
            size === 'lg' && 'text-[26px] xl:text-[30px]',
            size === 'md' && 'text-[22px] xl:text-[24px]',
            size === 'sm' && 'text-[18px]',
            VALUE_TONE[tone],
          )}
        >
          {value}
        </div>
        {delta}
      </div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

/** Показание на своей панели. */
export function MetricCard(props: Parameters<typeof Metric>[0] & { href?: string }) {
  const { className, ...rest } = props;
  return (
    <div className={cn('rounded-lg border border-border bg-card px-4 py-3.5', className)}>
      <Metric {...rest} />
    </div>
  );
}

/**
 * Полоса показаний: одна панель, разделённая волосяными линиями.
 * Читается как одно показание с несколькими слагаемыми, а не как
 * четыре одинаковые карточки.
 */
export function MetricStrip({
  children,
  className,
  columns,
}: {
  children: ReactNode;
  className?: string;
  /** число колонок на широком экране; по умолчанию по числу детей */
  columns?: 2 | 3 | 4 | 5;
}) {
  return (
    <div
      data-slot="metric-strip"
      className={cn(
        'grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:divide-x sm:divide-y-0',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        columns === 4 && 'sm:grid-cols-2 lg:grid-cols-4',
        columns === 5 && 'sm:grid-cols-3 lg:grid-cols-5',
        !columns && 'sm:grid-flow-col sm:auto-cols-fr',
        '*:px-4 *:py-3.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Сравнение с прошлым отрезком: «+12 400 ֏» или «+12,4 %».
 *
 * Знак считается здесь, цвет тоже. `good` говорит, в какую сторону
 * рост хорош: у выручки вверх, у расходов вниз. Без базы сравнения
 * выводится тихая подпись вместо числа.
 */
export function Delta({
  value,
  formatted,
  good = 'up',
  noBase,
  suffix,
  className,
}: {
  /** разница; по её знаку выбирается цвет */
  value: number | null;
  /** уже отформатированный модуль: «12 400 ֏» или «12,4 %» */
  formatted?: string;
  good?: 'up' | 'down';
  /** подпись, когда базы нет: «нет данных для сравнения» */
  noBase?: string;
  /** «к прошлой неделе» */
  suffix?: string;
  className?: string;
}) {
  if (value === null) {
    return noBase ? (
      <span className={cn('text-xs text-muted-foreground', className)}>{noBase}</span>
    ) : null;
  }
  const positive = value > 0;
  const zero = value === 0;
  const isGood = zero ? null : good === 'up' ? positive : !positive;
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        zero && 'bg-muted text-muted-foreground',
        isGood === true && 'bg-success-soft text-success-soft-foreground',
        isGood === false && 'bg-destructive-soft text-destructive-soft-foreground',
        className,
      )}
    >
      {positive ? '+' : value < 0 ? '−' : ''}
      {formatted ?? Math.abs(value)}
      {suffix && <span className="font-normal opacity-80">{suffix}</span>}
    </span>
  );
}

/** Деньги как текст, всегда табличными цифрами. */
export function MoneyValue({
  children,
  tone = 'default',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return <span className={cn('num', VALUE_TONE[tone], className)}>{children}</span>;
}
