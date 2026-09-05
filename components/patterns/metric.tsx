import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { cn } from '@/lib/utils';

type Tone = 'default' | 'success' | 'warning' | 'destructive' | 'muted' | 'primary';

/* На телефоне у знаков свои чернила: приглушённее десктопных, потому
   что на белом листе рядом с двумя цветами марки янтарный и красный в
   полную силу читаются аварией там, где речь про обычный долг. */
const VALUE_TONE: Record<Tone, string> = {
  default: 'text-foreground max-md:text-m-ink',
  success: 'text-success max-md:text-m-good',
  warning: 'text-warning max-md:text-m-warn',
  destructive: 'text-destructive max-md:text-m-bad',
  muted: 'text-muted-foreground max-md:text-m-muted',
  primary: 'text-primary max-md:text-m-grape',
};

/**
 * Показание: подпись мелким капсом, число крупно, строка пояснения.
 *
 * Кегль числа задаёт важность: `lg` для одного главного показателя
 * страницы, `md` для полосы KPI, `sm` для показаний внутри панелей.
 * Цвет числа по умолчанию чёрный; тон ставится только там, где знак
 * несёт смысл (убыток, долг, срок).
 *
 * С `href` показание становится ссылкой туда, где видно, из чего оно
 * сложилось: зарплата ведёт к начислениям, расходы к списку трат.
 * Число, на которое нельзя нажать, обрывает разговор на «сколько» и не
 * даёт спросить «из чего» — а спрашивают об этом каждый раз.
 *
 * Поле показания сюда не заводится: отступы ставит полоса
 * (`MetricStrip`), и подсветка обязана заливать всю ячейку, а не
 * прямоугольник вокруг текста. Стрелка у подписи видна всегда,
 * приглушённой: появляющаяся только под курсором никого не научит, что
 * сюда можно нажать, а на телефоне курсора нет вовсе.
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
  href,
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
  /** куда ведёт число: разбор, из чего оно сложилось */
  href?: string;
}) {
  const body = (
    <>
      {/* На телефоне подпись набрана обычным регистром: капсом с
          разрядкой набирают ярлыки таблиц, а здесь это подпись
          показания — та же, что в приложении. */}
      <div className="flex min-w-0 items-center gap-1 text-2xs font-medium tracking-wider text-muted-foreground uppercase max-md:text-[length:var(--m-t-note)] max-md:font-medium max-md:tracking-normal max-md:text-m-muted max-md:normal-case">
        <span className="truncate">{label}</span>
        {href && (
          <ArrowUpRight
            aria-hidden
            className="size-3 shrink-0 opacity-45 transition-opacity group-hover/metric:opacity-100 group-focus-visible/metric:opacity-100"
          />
        )}
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <div
          className={cn(
            'num min-w-0 leading-none font-semibold tracking-[-0.02em] break-words',
            /* Кегль числа задаёт важность. На телефоне главное
               показание экрана крупнее десктопного: оно там одно, и
               ответ должен читаться раньше, чем прочитана подпись. */
            size === 'lg' &&
              'text-[26px] max-md:text-[clamp(34px,11vw,44px)] max-md:font-bold max-md:tracking-[-0.03em] xl:text-[30px]',
            size === 'md' && 'text-[22px] max-md:text-[length:var(--m-t-stat)] max-md:font-bold xl:text-[24px]',
            size === 'sm' && 'text-[18px] max-md:text-[length:var(--m-t-section)] max-md:font-bold',
            VALUE_TONE[tone],
          )}
        >
          {value}
        </div>
        {delta}
      </div>
      {hint && (
        <div className="text-xs text-muted-foreground max-md:text-[length:var(--m-t-note)] max-md:text-m-faint">
          {hint}
        </div>
      )}
    </>
  );

  const shape = cn(
    'flex min-w-0 flex-col gap-1',
    selected && 'border-l-2 border-lime pl-3 max-md:rounded-m-tile! max-md:border-0 max-md:bg-m-lime! max-md:pl-4',
    className,
  );

  if (!href) {
    return (
      <div data-slot="metric" data-selected={selected || undefined} className={shape}>
        {body}
      </div>
    );
  }

  return (
    <Link
      href={href}
      data-slot="metric"
      data-selected={selected || undefined}
      className={cn(
        shape,
        'group/metric outline-none transition-colors',
        /* Подсветка только на широком экране: на телефоне полоса
           рассыпается в плитки со своей заливкой, и серый десктопный
           наведённый фон гасил бы их под пальцем. */
        'md:hover:bg-muted/60 md:focus-visible:bg-muted/60',
        'focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset',
      )}
    >
      {body}
    </Link>
  );
}

/** Показание на своей панели. */
export function MetricCard(props: Parameters<typeof Metric>[0]) {
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
  columns?: 2 | 3 | 4 | 5 | 6;
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
        columns === 6 && 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6',
        !columns && 'sm:grid-flow-col sm:auto-cols-fr',
        '*:px-4 *:py-3.5',
        /* На телефоне полоса становится карточкой приложения: главное
           показание во всю ширину сверху, остальные фактами в два
           столбца под ним. Четыре одинаковых показания в столбик — это
           четыре экрана прокрутки, на которых ни одно из них не
           главное; здесь иерархия видна раньше, чем прочитана
           подпись. */
        'max-md:grid-cols-2 max-md:gap-2.5 max-md:overflow-visible max-md:rounded-none',
        'max-md:border-0 max-md:bg-transparent max-md:divide-y-0',
        'max-md:[&>*]:rounded-m-tile max-md:[&>*]:bg-m-tile max-md:[&>*]:border-0',
        /* Главное показание во всю ширину, факты по двое. Когда фактов
           чётное число, последний тоже растягивается: одинокая плитка в
           левой половине читается как незакрытая строка. */
        'max-md:[&>*:first-child]:col-span-2',
        'max-md:[&:has(>*:nth-child(2n):last-child)>*:last-child]:col-span-2',
        'max-md:*:px-4 max-md:*:py-4',
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
 * рост хорош: у выручки вверх, у расходов вниз.
 *
 * Без базы не выводится ничего. Здесь была подпись «сравнивать не с
 * чем»: она занимала место значения, из-за чего одно показание полосы
 * оказывалось устроено не так, как соседние, и полоса переставала
 * читаться полосой. Отсутствие сравнения и так видно.
 */
export function Delta({
  value,
  formatted,
  good = 'up',
  suffix,
  className,
}: {
  /** разница; по её знаку выбирается цвет; `null` — сравнивать не с чем */
  value: number | null;
  /** уже отформатированный модуль: «12 400 ֏» или «12,4 %» */
  formatted?: string;
  good?: 'up' | 'down';
  /** «к прошлой неделе» */
  suffix?: string;
  className?: string;
}) {
  if (value === null) return null;
  const positive = value > 0;
  const zero = value === 0;
  const isGood = zero ? null : good === 'up' ? positive : !positive;
  return (
    <span
      className={cn(
        'num inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium',
        /* На телефоне это фишка того же вида, что фишки периода: рост
           лаймовый — единственная хорошая новость экрана имеет право на
           фирменный цвет; остальное тихое. */
        'max-md:h-7 max-md:rounded-full max-md:px-2.5 max-md:text-[13px] max-md:font-bold',
        zero && 'bg-muted text-muted-foreground max-md:bg-m-tile max-md:text-m-muted',
        isGood === true &&
          'bg-success-soft text-success-soft-foreground max-md:bg-m-lime max-md:text-[#170b2b]',
        isGood === false &&
          'bg-destructive-soft text-destructive-soft-foreground max-md:bg-m-tile max-md:text-m-ink',
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
