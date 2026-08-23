import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Панель: белая поверхность с границей в один пиксель.
 *
 * Единственный контейнер продукта. Заголовок внутри невелик и стоит
 * в одну строку с действиями; счётчик рядом с ним тихий. Там, где
 * группировка не нужна, панель не ставится: таблица или список могут
 * лежать прямо на полотне.
 *
 * `padded={false}` для таблиц и списков, которым нужен край панели
 * без внутреннего поля.
 */
export function Panel({
  title,
  description,
  count,
  actions,
  children,
  className,
  bodyClassName,
  padded = true,
  id,
  as: Tag = 'section',
}: {
  title?: ReactNode;
  description?: ReactNode;
  count?: number | string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  padded?: boolean;
  id?: string;
  as?: 'section' | 'div' | 'article';
}) {
  const hasHead = title !== undefined || actions !== undefined;
  return (
    <Tag
      id={id}
      data-slot="panel"
      className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card', className)}
    >
      {hasHead && (
        <div className="flex items-start justify-between gap-3 px-4 pt-3.5 pb-3">
          <div className="min-w-0">
            {title !== undefined && (
              <h2 className="flex items-center gap-2 text-sm leading-tight font-semibold">
                {title}
                {count !== undefined && (
                  <span className="num rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {count}
                  </span>
                )}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      <div
        className={cn(
          'min-w-0 flex-1',
          padded && (hasHead ? 'px-4 pb-4' : 'p-4'),
          !padded && hasHead && 'border-t border-border',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </Tag>
  );
}

/**
 * Сетка панелей на двенадцать колонок. Ширина блока задаётся классом
 * `lg:col-span-N` на самой панели: важное шире, второстепенное уже.
 */
export function PanelGrid({
  children,
  className,
  at = 'lg',
}: {
  children: ReactNode;
  className?: string;
  /** с какой ширины включаются колонки: `xl` для сеток с широкой таблицей */
  at?: 'lg' | 'xl';
}) {
  return (
    <div className={cn('grid gap-4', at === 'lg' ? 'lg:grid-cols-12' : 'xl:grid-cols-12', className)}>
      {children}
    </div>
  );
}
