import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Пусто — и сказано, что с этим делать.
 *
 * Без иллюстраций и без рамки: человек уже понял, что здесь ничего нет,
 * ему нужно знать следующий шаг. Заголовок отвечает «что происходит»,
 * строка под ним — «почему» или «что сделать», и только если есть
 * настоящее действие, под ними встаёт кнопка.
 */
export function MobileEmpty({
  title,
  note,
  action,
  className,
  compact = false,
}: {
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-1.5 px-5 text-center',
        compact ? 'py-8' : 'py-12',
        className,
      )}
    >
      <p className="text-[15px] font-semibold text-m-ink">{title}</p>
      {note && <p className="max-w-[34ch] text-[13px] leading-snug text-m-muted">{note}</p>}
      {action && <div className="mt-3 w-full max-w-[280px]">{action}</div>}
    </div>
  );
}

/**
 * Не получилось.
 *
 * Нули вместо выручки — худшее, что может показать денежный экран:
 * неверные данные выглядят как верные, и решение принимается по ним.
 * Лучше честно ничего плюс кнопка повтора.
 */
export function MobileError({
  title,
  note,
  action,
  className,
}: {
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center gap-2.5 px-5 py-12 text-center', className)}
    >
      <TriangleAlert aria-hidden className="size-6 text-primary" />
      <p className="text-[15px] font-semibold text-m-ink">{title}</p>
      {note && <p className="max-w-[34ch] text-[13px] leading-snug text-m-muted">{note}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Место содержимого, а не пустота.
 *
 * Скелет повторяет форму именно той страницы, на которой стоит: скелет
 * чужой формы читается как «загрузилось неправильно».
 */
export function MobileSkeleton({
  className,
  height,
  width,
  radius = 12,
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
  radius?: number;
}) {
  return (
    <span
      aria-hidden
      className={cn('block animate-pulse bg-m-inset', className)}
      style={{ height, width, borderRadius: radius }}
    />
  );
}

/** Стопка мест под строки списка. */
export function MobileSkeletonRows({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col', className)} aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-m-hair px-1 py-3 last:border-b-0">
          <MobileSkeleton width={34} height={34} radius={999} />
          <div className="flex flex-1 flex-col gap-1.5">
            <MobileSkeleton width={`${52 + ((i * 13) % 26)}%`} height={13} />
            <MobileSkeleton width={`${34 + ((i * 7) % 18)}%`} height={11} />
          </div>
          <MobileSkeleton width={58} height={13} />
        </div>
      ))}
    </div>
  );
}
