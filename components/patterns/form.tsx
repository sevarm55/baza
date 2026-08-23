import type { ReactNode } from 'react';
import { CircleAlert, CircleCheck } from 'lucide-react';

import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

/**
 * Раздел формы: заголовок, пояснение и поля.
 *
 * Большая форма не должна выглядеть как бесконечный столбик полей.
 * Разделы отделены линией, внутри поля идут сеткой `FormGrid`.
 */
export function FormSection({
  title,
  description,
  children,
  className,
  first = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
  /** первый раздел: без линии сверху */
  first?: boolean;
}) {
  return (
    <section className={cn('flex flex-col gap-4', className)}>
      {!first && <Separator />}
      {(title || description) && (
        <div className="flex flex-col gap-0.5">
          {title && <h3 className="text-sm font-semibold">{title}</h3>}
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
      )}
      <div className="flex flex-col gap-4">{children}</div>
    </section>
  );
}

/** Поля в две колонки на широком экране, в одну на узком. */
export function FormGrid({
  children,
  className,
  columns = 2,
}: {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3;
}) {
  return (
    <div
      className={cn(
        'grid gap-4',
        columns === 2 && 'sm:grid-cols-2',
        columns === 3 && 'sm:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Сообщение формы: ошибка действия или подтверждение.
 * Локальное, рядом с кнопкой; не заменяет собой экран.
 */
export function FormMessage({
  tone = 'error',
  children,
  className,
}: {
  tone?: 'error' | 'success' | 'info';
  children: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-1.5 text-sm',
        tone === 'error' && 'text-destructive',
        tone === 'success' && 'text-success',
        tone === 'info' && 'text-muted-foreground',
        className,
      )}
    >
      {tone === 'error' && <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      {tone === 'success' && <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
      <span>{children}</span>
    </p>
  );
}

/**
 * Строка настройки: подпись и пояснение слева, управление справа.
 * Для переключателей, выбора темы, коротких полей.
 */
export function SettingRow({
  label,
  description,
  control,
  htmlFor,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  control: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3', className)}>
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="block text-sm font-medium">
          {label}
        </label>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

/** Список строк настроек, разделённых волосяными линиями. */
export function SettingList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('flex flex-col divide-y divide-border', className)}>{children}</div>;
}
