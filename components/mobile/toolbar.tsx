'use client';

import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';

import { MobileChip } from '@/components/mobile/button';
import { cn } from '@/lib/utils';

/**
 * Поиск на телефоне: одно поле во всю ширину.
 *
 * Кегль набора — 16 пикселей: на iOS Safari поле с меньшим кеглем при
 * фокусе увеличивает всю страницу, и человек оказывается на криво
 * отмасштабированном экране, из которого сам выбраться не может.
 *
 * Крестик появляется только когда есть что стирать: пустая кнопка в
 * поле — это цель для пальца, которая ничего не делает.
 */
export function MobileSearch({
  value,
  onChange,
  placeholder,
  numeric = false,
  clearLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** номера и суммы: поднимаем цифровую клавиатуру */
  numeric?: boolean;
  clearLabel: string;
  className?: string;
}) {
  return (
    <div className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-m-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={numeric ? 'search' : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          'h-[46px] w-full min-w-0 rounded-m-tile bg-m-inset pr-10 pl-10 text-[16px] text-m-ink',
          'placeholder:text-m-muted',
          'outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
          '[&::-webkit-search-cancel-button]:hidden',
        )}
      />
      {value !== '' && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={() => onChange('')}
          className="m-press absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-m-chip text-m-muted"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </div>
  );
}

/**
 * Полоса фильтров: прокрутка вбок, а не перенос на вторую строку.
 *
 * Фильтров бывает четыре и больше, а на узком экране в ряд помещается
 * два с половиной. Перенос сдвинул бы вниз весь список ради одной
 * кнопки; прокрутка не сдвигает ничего, и то, что полоса продолжается,
 * видно по обрезанной кнопке у края.
 */
export function MobileChipRow({
  items,
  value,
  onChange,
  label,
  className,
}: {
  items: { key: string; label: ReactNode; count?: number }[];
  value: string;
  onChange: (key: string) => void;
  label: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        '-mx-4 overflow-x-auto px-4 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      <div className="flex w-max gap-1.5">
        {items.map((item) => (
          <MobileChip
            key={item.key}
            tone="ink"
            selected={item.key === value}
            onClick={() => onChange(item.key)}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="num opacity-60">{item.count}</span>
            )}
          </MobileChip>
        ))}
      </div>
    </div>
  );
}
