import type { ReactNode } from 'react';

import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { ErrorState } from '@/components/patterns/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Панель графика с четырьмя состояниями: данные, пусто, ошибка, ожидание.
 *
 * Страница отчёта собирает каждый блок отдельным запросом и отдаёт
 * сюда результат как есть: упавший блок становится «не загрузился» со
 * своим объяснением, а остальные живут дальше. Это и есть правило
 * «один сломанный график не уничтожает весь отчёт».
 */
export function ChartPanel({
  title,
  description,
  actions,
  status = 'ok',
  emptyTitle,
  errorTitle,
  height = 'h-64',
  className,
  children,
  padded = true,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  status?: 'ok' | 'empty' | 'error' | 'loading';
  emptyTitle?: ReactNode;
  errorTitle?: ReactNode;
  /** класс высоты области графика: одинаковая у соседей в ряду */
  height?: string;
  className?: string;
  children: ReactNode;
  padded?: boolean;
}) {
  return (
    <Panel className={className} title={title} description={description} actions={actions} padded={padded}>
      {status === 'ok' ? (
        children
      ) : status === 'empty' ? (
        <EmptyState compact className={cn(height, 'justify-center')} title={emptyTitle} />
      ) : status === 'error' ? (
        <ErrorState compact className={cn(height, 'justify-center')} title={errorTitle} />
      ) : (
        <div className={cn(height, 'flex flex-col justify-end gap-2 px-1 pb-1')} aria-busy>
          <Skeleton className="h-full w-full" />
        </div>
      )}
    </Panel>
  );
}

/** Подсказка к графику: одна на все графики продукта. */
export function ChartTip({
  title,
  rows,
  className,
}: {
  title: ReactNode;
  rows: { label: ReactNode; value: ReactNode; color?: string; muted?: boolean }[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        'min-w-40 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground',
        className,
      )}
    >
      <div className="mb-1.5 font-medium text-muted-foreground">{title}</div>
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => (
          <div key={i} className={cn('flex items-center justify-between gap-4', r.muted && 'text-muted-foreground')}>
            <span className="flex items-center gap-1.5">
              {r.color && <span aria-hidden className="size-2 rounded-full" style={{ background: r.color }} />}
              {r.label}
            </span>
            <span className="num font-medium">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** «12 000» → «12k»: ось не должна занимать половину ширины. */
export function compactNumber(n: number): string {
  const abs = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (abs >= 1_000_000) return `${sign}${Math.round(abs / 100_000) / 10}M`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1_000) return `${sign}${Math.round(abs / 100) / 10}k`;
  return `${sign}${abs}`;
}
