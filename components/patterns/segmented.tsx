'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { usePendingTab } from '@/components/use-pending-tab';
import { cn } from '@/lib/utils';

export type Segment = {
  key: string;
  label: ReactNode;
  /** переход: выбор живёт в адресе (период, месяц) */
  href?: string;
  /** тихое число рядом с подписью */
  count?: number;
};

/**
 * Сегментированный переключатель: единственный переключатель продукта.
 *
 * Два способа выбрать: `href` (выбор живёт в адресе, подсвечивается
 * сразу, не дожидаясь сервера) и `onSelect` (выбор живёт в состоянии
 * страницы). Один вид для обоих.
 */
export function Segmented({
  items,
  current,
  onSelect,
  label,
  size = 'md',
  full = false,
  className,
}: {
  items: Segment[];
  current: string;
  onSelect?: (key: string) => void;
  /** подпись для чтеца экрана */
  label?: string;
  size?: 'sm' | 'md';
  /** во всю ширину: сегменты делят её поровну */
  full?: boolean;
  className?: string;
}) {
  const { active, pending, select } = usePendingTab(current);

  return (
    <div
      role="tablist"
      aria-label={label}
      data-pending={pending || undefined}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] no-scrollbar',
        size === 'md' ? 'h-9' : 'h-8',
        full && 'flex w-full',
        className,
      )}
    >
      {items.map((item) => {
        const on = item.key === active;
        const cls = cn(
          'inline-flex h-full shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
          size === 'sm' && 'px-2.5 text-[13px]',
          full && 'flex-1',
          on
            ? 'border border-border bg-card text-foreground'
            : 'border border-transparent text-muted-foreground hover:text-foreground',
        );
        const inner = (
          <>
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'num rounded-sm px-1 text-2xs leading-4',
                  on ? 'bg-muted text-muted-foreground' : 'text-muted-foreground/80',
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );
        if (item.href) {
          return (
            <Link
              key={item.key}
              href={item.href}
              role="tab"
              aria-selected={on}
              aria-current={on ? 'page' : undefined}
              className={cls}
              onClick={() => select(item.key)}
            >
              {inner}
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            className={cls}
            onClick={() => {
              select(item.key);
              onSelect?.(item.key);
            }}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
