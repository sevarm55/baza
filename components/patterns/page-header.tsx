import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Шапка раздела.
 *
 * Слева заголовок и одна тихая строка контекста (даты периода, счётчик,
 * пояснение). Справа управление: главное действие одно, остальные
 * тише. Ряд под шапкой (`children`) отдан инструментам страницы:
 * периоду, фильтрам, вкладкам. Если инструментов нет, ряда нет.
 */
export function PageHeader({
  title,
  description,
  meta,
  actions,
  back,
  children,
  className,
}: {
  title: ReactNode;
  /** пояснение, что это за страница: одной короткой фразой */
  description?: ReactNode;
  /** строка контекста под заголовком: период, дата, счётчик */
  meta?: ReactNode;
  /** кнопки справа: одна главная, остальные outline/ghost */
  actions?: ReactNode;
  /** ссылка назад для вложенных страниц */
  back?: { href: string; label: string };
  /** ряд инструментов под шапкой */
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-5 flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 flex-1">
          {back && (
            <Link
              href={back.href}
              className="mb-1.5 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="size-3.5" aria-hidden />
              {back.label}
            </Link>
          )}
          <h1 className="truncate text-[22px] leading-tight font-semibold tracking-[-0.01em]">
            {title}
          </h1>
          {(description || meta) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
              {description}
              {meta}
            </div>
          )}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/**
 * Заголовок блока внутри страницы: секции, группы, списка.
 * Размер один на весь продукт, чтобы иерархия читалась весом и
 * положением, а не кеглем.
 */
export function SectionHeader({
  title,
  count,
  description,
  actions,
  className,
  as: Tag = 'h2',
}: {
  title: ReactNode;
  count?: number | string;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  as?: 'h2' | 'h3';
}) {
  return (
    <div className={cn('mb-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-2', className)}>
      <div className="min-w-0">
        <Tag className="flex items-center gap-2 text-[15px] leading-tight font-semibold">
          {title}
          {count !== undefined && (
            <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {count}
            </span>
          )}
        </Tag>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}
