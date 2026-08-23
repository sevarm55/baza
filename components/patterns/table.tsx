import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Оболочка таблицы: панель с границей, горизонтальная прокрутка
 * внутри неё, а не у страницы. Сами строки собираются из примитивов
 * `components/ui/table`.
 */
export function TableShell({
  children,
  className,
  title,
  actions,
  footer,
}: {
  children: ReactNode;
  className?: string;
  /** заголовок над таблицей внутри той же панели */
  title?: ReactNode;
  actions?: ReactNode;
  /** строка под таблицей: итог, пояснение, пагинация */
  footer?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card', className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          {title && <h2 className="min-w-0 text-sm font-semibold">{title}</h2>}
          {actions && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="scrollbar-thin min-w-0 overflow-x-auto">{children}</div>
      {footer && <div className="border-t border-border px-4 py-2.5 text-xs text-muted-foreground">{footer}</div>}
    </div>
  );
}

/** Классы для ячеек: числа справа, табличными цифрами. */
export const cellNum = 'num text-right whitespace-nowrap';
export const cellMuted = 'text-muted-foreground';
export const headNum = 'text-right';
