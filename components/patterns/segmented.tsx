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
      data-slot="segmented"
      aria-label={label}
      data-pending={pending || undefined}
      className={cn(
        'inline-flex max-w-full items-center gap-0.5 overflow-x-auto rounded-lg bg-muted p-[3px] no-scrollbar',
        size === 'md' ? 'h-9' : 'h-8',
        /* На телефоне дорожка выше и тёплая, как в приложении: сорок
           две точки — минимум, по которому попадают пальцем, не
           прицеливаясь.

           Двое-трое делят ширину поровну; от четырёх и больше полоса
           едет вбок. Втиснуть «Прошлый месяц» в четверть экрана
           нельзя — подпись обрежется на середине слова, и выбирать
           придётся по догадке. */
        'max-md:flex max-md:h-12 max-md:w-full max-md:min-w-0 max-md:max-w-full max-md:rounded-full max-md:bg-m-tile max-md:p-1',
        full && 'flex w-full',
        className,
      )}
    >
      {items.map((item) => {
        const on = item.key === active;
        const cls = cn(
          'inline-flex h-full shrink-0 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:ring-3 focus-visible:ring-ring/50',
          size === 'sm' && 'px-2.5 text-[13px]',
          'max-md:min-w-0 max-md:flex-1 max-md:rounded-full max-md:px-3 max-md:text-[14.5px] max-md:font-semibold',
          'max-md:in-[[data-slot=segmented]:has(>*:nth-child(4))]:flex-none max-md:in-[[data-slot=segmented]:has(>*:nth-child(4))]:px-3.5',
          full && 'flex-1',
          on
            ? 'border border-border bg-card text-foreground max-md:border-transparent max-md:bg-m-grape max-md:text-white'
            : 'border border-transparent text-muted-foreground hover:text-foreground max-md:text-m-muted',
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
