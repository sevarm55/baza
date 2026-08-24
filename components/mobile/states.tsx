import type { ReactNode } from 'react';

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
