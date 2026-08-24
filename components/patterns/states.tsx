import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Пустое состояние: заголовок, одна фраза и, если есть, действие.
 *
 * Без иллюстраций. Текст короткий: человек уже понял, что здесь
 * пусто, ему нужно знать, что делать дальше.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
  compact = false,
}: {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  /** внутри панели: меньше воздуха */
  compact?: boolean;
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 rounded-lg border border-dashed border-border px-6 py-12',
        /* На телефоне рамки нет: пунктирный прямоугольник во всю ширину
           экрана читается заглушкой, а не ответом. */
        'max-md:border-0 max-md:px-5',
        className,
      )}
    >
      {icon && (
        <div className="mb-1 flex size-9 items-center justify-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">
          {icon}
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <div className="text-sm font-semibold max-md:text-[15px]">{title}</div>
        {description && (
          <div className="text-sm text-muted-foreground max-md:text-[13px]">{description}</div>
        )}
      </div>
      {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  );
}

/** Скелет таблицы: шапка и строки той же геометрии, что у настоящей. */
export function SkeletonTable({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    /* На телефоне место под СПИСОК, а не под таблицу: скелет чужой
       формы читается как «загрузилось неправильно», а на телефоне
       вместо таблицы приезжают строки. */
    <div
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card',
        'max-md:rounded-none max-md:border-0 max-md:bg-transparent',
        className,
      )}
      aria-hidden
    >
      <div className="flex items-center gap-4 border-b border-border px-4 py-2.5 max-md:hidden">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="ml-auto h-3 w-16" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-4 py-3 last:border-b-0 max-md:gap-3 max-md:border-m-hair max-md:px-1 max-md:py-3.5"
        >
          <Skeleton className="hidden size-[34px] shrink-0 rounded-full max-md:block" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-[28%] max-md:h-3.5 max-md:w-[55%]" />
            <Skeleton className="hidden h-3 w-[38%] max-md:block" />
          </div>
          <Skeleton className="h-3.5 w-[16%] max-md:hidden" />
          <Skeleton className="ml-auto h-3.5 w-14" />
        </div>
      ))}
    </div>
  );
}

/** Скелет полосы показаний. */
export function SkeletonMetrics({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div
      className={cn(
        'grid divide-y divide-border overflow-hidden rounded-lg border border-border bg-card sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-y-0',
        /* Та же форма, что у настоящей полосы показаний на телефоне:
           главное во всю ширину, остальное по двое. */
        'max-md:grid-cols-2 max-md:divide-y-0 max-md:rounded-m-hero max-md:border-m-hair max-md:bg-m-surface',
        'max-md:[&>*:first-child]:col-span-2 max-md:[&>*:first-child]:border-b max-md:[&>*]:border-m-hair',
        'max-md:[&>*:nth-child(even)]:border-r max-md:[&>*:nth-child(n+4)]:border-t',
        className,
      )}
      aria-hidden
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex flex-col gap-2.5 px-4 py-4">
          <Skeleton className="h-2.5 w-20" />
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-2.5 w-16" />
        </div>
      ))}
    </div>
  );
}

/** Скелет шапки раздела: заголовок, строка контекста, кнопка справа. */
export function SkeletonHeader({ tools = true }: { tools?: boolean }) {
  return (
    /* Заголовка на телефоне нет: раздел уже назван шапкой экрана. */
    <div className="mb-5 flex items-start justify-between gap-4 max-md:mb-3" aria-hidden>
      <div className="flex flex-col gap-2 max-md:hidden">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-3 w-56" />
      </div>
      {tools && <Skeleton className="h-9 w-32 max-md:h-[46px] max-md:w-full max-md:rounded-m-tile" />}
    </div>
  );
}

/** Скелет панели произвольной высоты. */
export function SkeletonPanel({ className, rows = 0 }: { className?: string; rows?: number }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-4',
        'max-md:rounded-m-card max-md:border-m-hair max-md:bg-m-surface',
        className,
      )}
      aria-hidden
    >
      <Skeleton className="mb-4 h-3.5 w-32" />
      {rows > 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-7 rounded-full" />
              <Skeleton className="h-3.5 flex-1" />
              <Skeleton className="h-3.5 w-14" />
            </div>
          ))}
        </div>
      ) : (
        <Skeleton className="h-full min-h-24 w-full" />
      )}
    </div>
  );
}

/** Обёртка состояния загрузки страницы: озвучивается как «занято». */
export function LoadingPage({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-busy="true" aria-live="polite" className={cn('flex flex-col gap-4', className)}>
      {children}
    </div>
  );
}
