'use client';

import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

import { usePendingTab } from '@/components/use-pending-tab';
import { cn } from '@/lib/utils';

/**
 * Поле ввода, по которому попадают всей строкой.
 *
 * Подпись сверху, а не слева: у всех полей продукта один левый край, и
 * каретка не ищется заново на каждой строке. Коробка ловит касание
 * целиком — цель размером во всю строку, а не в несколько точек возле
 * каретки.
 *
 * Кегль набора — 16 пикселей и ни одним меньше. На iOS Safari поле с
 * меньшим кеглем при фокусе увеличивает всю страницу, и человек
 * оказывается на криво отмасштабированном экране, из которого сам
 * выбраться не может.
 */
export function MobileField({
  label,
  hint,
  error,
  children,
  className,
  htmlFor,
}: {
  label?: ReactNode;
  /** пояснение под полем: правило, пример, предел */
  hint?: ReactNode;
  /** что не так; отменяет `hint` */
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
          className="px-1 text-[12px] leading-none font-medium text-m-muted"
        >
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p role="alert" className="px-1 text-[12px] leading-snug text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="px-1 text-[12px] leading-snug text-m-muted">{hint}</p>
      ) : null}
    </div>
  );
}

/**
 * Сама коробка поля: вдавленная подложка, крупный набор, высота 54.
 *
 * `inputMode` и `type` приходят снаружи и решают, какую клавиатуру
 * поднимет телефон: цифровую для суммы, телефонную для номера. Это не
 * косметика — на цифровой клавиатуре сумма набирается вдвое быстрее и
 * без опечаток.
 */
export function MobileInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      {...rest}
      className={cn(
        'h-[54px] w-full min-w-0 rounded-m-tile bg-m-inset px-4 text-[16px] font-medium text-m-ink',
        'placeholder:font-normal placeholder:text-m-muted',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
        'disabled:opacity-50',
        className,
      )}
    />
  );
}

/**
 * Выбор из многих — родной `select` телефона.
 *
 * Родной намеренно: системный барабан iOS и список Android человек уже
 * умеет крутить, а нарисованный список внутри страницы приходится
 * учиться листать заново и он ломается под клавиатурой.
 */
export function MobileSelect({ className, children, ...rest }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        {...rest}
        className={cn(
          'h-[54px] w-full min-w-0 appearance-none rounded-m-tile bg-m-inset pr-10 pl-4 text-[16px] font-medium text-m-ink',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          'disabled:opacity-50',
          className,
        )}
      >
        {children}
      </select>
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-m-muted"
      >
        <svg width="12" height="8" viewBox="0 0 12 8" fill="none">
          <path
            d="M1 1.5 6 6.5 11 1.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
    </div>
  );
}

/**
 * Переключатель периода: дорожка и выбранная плашка.
 *
 * Плашка светлее дорожки — так «выбрано» читается подсветкой, а не
 * цветом, и не спорит с грейпом и лаймом, у которых на экране свои роли.
 */
export function MobileSegmented<T extends string>({
  value,
  options,
  onChange,
  label,
  className,
}: {
  value: T;
  options: { key: T; label: ReactNode }[];
  onChange: (next: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('flex min-w-0 gap-0.5 rounded-m-chip bg-m-chip p-[3px]', className)}
    >
      {options.map((option) => {
        const on = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.key)}
            className={cn(
              'm-press min-w-0 flex-1 truncate rounded-[9px] px-2 py-1.5 text-[13px] font-semibold transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              on ? 'bg-m-surface text-m-ink' : 'text-m-muted',
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
 * Тот же переключатель, но выбор живёт в адресе.
 *
 * Период сводки — часть адреса: по ссылке «прошлый месяц» можно
 * вернуться, её можно переслать, и обновление страницы не сбрасывает
 * выбор. Поэтому здесь ссылки, а не кнопки.
 *
 * Подсветка переезжает на нажатую плашку сразу, не дожидаясь сервера:
 * страницы кабинета динамические, и полсекунды мёртвого экрана человек
 * читает как промах.
 */
export function MobileSegmentedLinks({
  current,
  items,
  label,
  className,
}: {
  current: string;
  items: { key: string; label: ReactNode; href: string }[];
  label: string;
  className?: string;
}) {
  const { active, pending, select } = usePendingTab(current);

  return (
    <nav
      aria-label={label}
      className={cn('flex min-w-0 gap-0.5 rounded-m-chip bg-m-chip p-[3px]', className)}
    >
      {items.map((item) => {
        const on = item.key === active;
        return (
          <Link
            key={item.key}
            href={item.href}
            onClick={() => select(item.key)}
            aria-current={on ? 'page' : undefined}
            data-pending={pending && on ? '' : undefined}
            className={cn(
              'm-press min-w-0 flex-1 truncate rounded-[9px] px-2 py-2 text-center text-[13px] font-semibold transition-colors',
              'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
              on ? 'bg-m-surface text-m-ink' : 'text-m-muted',
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
