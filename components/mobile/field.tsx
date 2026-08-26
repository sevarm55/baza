'use client';

import type { ComponentProps, ReactNode } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Поля мобильного слоя.
 *
 * Высота пятьдесят четыре и текст в семнадцать пунктов: на меньшем
 * кегле iOS увеличивает страницу при касании поля, и экран уезжает.
 * Подпись стоит НАД полем, а не внутри плавающей меткой: метка,
 * уезжающая вверх при наборе, оставляет поле без названия ровно в тот
 * момент, когда его перечитывают.
 */
export function MField({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  /** тихая подсказка под полем */
  hint?: ReactNode;
  /** ошибка вместо подсказки: красная и с тем же местом */
  error?: ReactNode;
  children: ReactNode;
  className?: string;
  htmlFor?: string;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      {label && (
        <label
          htmlFor={htmlFor}
          className="px-1 text-[13px] leading-tight font-semibold text-m-muted"
        >
          {label}
        </label>
      )}
      {children}
      {(error || hint) && (
        <p
          className={cn(
            'px-1 text-[12.5px] leading-snug',
            error ? 'text-m-bad' : 'text-m-faint',
          )}
        >
          {error ?? hint}
        </p>
      )}
    </div>
  );
}

/**
 * Поле белое и обведено волосяной гранью, а не залито тоном плитки.
 *
 * Тон здесь не работает: поля живут и на белом листе, и внутри
 * сиреневых плиток, и залитое тоном поле внутри плитки исчезает
 * целиком. Белая заливка с гранью различима на обоих фонах, а в фокусе
 * появляется грейповое кольцо — единственный признак, который здесь и
 * нужен.
 */
const FIELD_BASE =
  'h-[calc(var(--m-control-h)+2px)] w-full min-w-0 rounded-m-row border border-m-hair bg-m-bg px-4 text-[length:var(--m-t-field)] font-medium text-m-ink outline-none placeholder:text-m-faint focus-visible:border-transparent focus-visible:ring-2 focus-visible:ring-m-grape/45 disabled:opacity-50';

export function MInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cn(FIELD_BASE, className)} />;
}

export function MTextarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...rest}
      className={cn(FIELD_BASE, 'h-auto min-h-[96px] resize-none py-3.5 leading-snug', className)}
    />
  );
}

/**
 * Выбор из списка — родной `select` телефона.
 *
 * Родной, а не свой: система показывает его колесом внизу экрана, и
 * это колесо человек уже умеет крутить. Свой список из тридцати
 * филиалов был бы хуже ровно на тридцать строк.
 */
export function MSelect({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <span className="relative flex min-w-0">
      <select {...rest} className={cn(FIELD_BASE, 'appearance-none pr-11', className)}>
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-4 size-[18px] -translate-y-1/2 text-m-muted"
        strokeWidth={2}
      />
    </span>
  );
}

/**
 * Огромное поле номера машины.
 *
 * Единственное поле продукта, набранное в тридцать два пункта по
 * центру. Номер — это то, ради чего открыт экран записи, и он должен
 * читаться с вытянутой руки: мойщик вводит его мокрыми пальцами, стоя
 * у машины, и сверяет с настоящим номером на кузове.
 */
export function MPlateInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      {...rest}
      autoCapitalize="characters"
      autoComplete="off"
      spellCheck={false}
      className={cn(
        'num h-[72px] w-full min-w-0 rounded-m-tile border border-m-hair bg-m-bg text-center',
        'text-[32px] font-bold tracking-[0.06em] text-m-ink uppercase',
        'outline-none placeholder:font-medium placeholder:tracking-normal placeholder:text-m-faint',
        'focus-visible:ring-2 focus-visible:ring-m-grape/45',
        className,
      )}
    />
  );
}

/**
 * Переключатель из двух-трёх слов: капсула с ездящей заливкой.
 *
 * Для двух-трёх вариантов, которые надо видеть все сразу. Когда
 * вариантов больше — это ряд фишек (`MChipRow`), а не сегменты: слова в
 * сегментах сжимаются до огрызков.
 */
export function MSegmented<T extends string>({
  options,
  value,
  onChange,
  className,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('flex gap-1 rounded-full bg-m-tile p-1', className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'm-press h-10 min-w-0 flex-1 truncate rounded-full px-3 text-[14.5px] font-semibold',
              'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-m-grape/40',
              selected ? 'bg-m-grape text-white' : 'text-m-muted',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Переключатель «да/нет» вида телефона.
 *
 * Лаймовый во включённом положении: включённое здесь значит «работает
 * прямо сейчас», и это ровно тот смысл, за который в системе отвечает
 * лайм.
 */
export function MSwitch({
  checked,
  onChange,
  label,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full transition-colors duration-200',
        'outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40 disabled:opacity-45',
        checked ? 'bg-m-grape' : 'bg-m-tile-strong',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute size-[27px] rounded-full bg-white transition-transform duration-200',
          checked ? 'translate-x-[22px]' : 'translate-x-[2px]',
        )}
        style={{ boxShadow: '0 1px 3px rgb(23 11 43 / 0.28)' }}
      />
    </button>
  );
}

/**
 * Поиск: лупа слева, крестик справа, когда есть что стирать.
 *
 * Крестик обязателен: стирать двадцать символов клавишей забоя на
 * телефоне — то же самое, что не иметь поиска вовсе.
 */
export function MSearch({
  value,
  onChange,
  placeholder,
  clearLabel,
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'value' | 'onChange'> & {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel: string;
}) {
  return (
    <div className={cn('relative flex min-w-0 items-center', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute left-4 size-[18px] text-m-faint"
        strokeWidth={2}
      />
      <input
        {...rest}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={cn(
          FIELD_BASE,
          'pl-11 [&::-webkit-search-cancel-button]:hidden',
          value && 'pr-12',
        )}
      />
      {value && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="m-press absolute right-2.5 flex size-9 items-center justify-center rounded-full bg-m-tile-strong text-m-muted outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
        >
          <X aria-hidden className="size-4" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}
