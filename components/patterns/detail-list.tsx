import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Факты о сущности: подпись слева, значение справа, строки разделены
 * волосяными линиями. Для карточек клиента, сотрудника, расхода.
 */
export function DetailList({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <dl className={cn('divide-y divide-border text-sm max-md:divide-m-hair', className)}>
      {children}
    </dl>
  );
}

export function DetailRow({
  label,
  value,
  mono = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-2 max-md:min-h-[44px] max-md:items-center max-md:py-2.5', className)}>
      <dt className="shrink-0 text-muted-foreground max-md:text-[14px]">{label}</dt>
      <dd className={cn('min-w-0 text-right font-medium max-md:text-[15px] max-md:font-semibold', mono && 'num')}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Строка-ссылка: переход в соседний раздел из карточки или настроек.
 */
export function LinkRow({
  href,
  title,
  note,
  icon,
  right,
  className,
  download,
}: {
  href: string;
  title: ReactNode;
  note?: ReactNode;
  icon?: ReactNode;
  right?: ReactNode;
  className?: string;
  download?: boolean;
}) {
  const body = (
    <>
      {/* На телефоне значок без плашки под ним: плашка — ещё один
          прямоугольник, а их в коробке и так по одному на строку. */}
      {icon && (
        <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground max-md:size-7 max-md:bg-transparent max-md:text-primary max-md:[&_svg]:size-[19px] [&_svg]:size-4">
          {icon}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium max-md:text-[16px] max-md:font-semibold">
          {title}
        </span>
        {note && (
          <span className="block truncate text-xs text-muted-foreground max-md:text-[12.5px]">
            {note}
          </span>
        )}
      </span>
      {right ?? (
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground max-md:size-[18px]"
          aria-hidden
        />
      )}
    </>
  );
  /* Шестьдесят точек высоты на телефоне — минимальная цель, по
     которой уверенно попадают мокрым пальцем. */
  const cls = cn(
    'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60',
    'max-md:m-press max-md:min-h-[60px] max-md:gap-3.5 max-md:py-2.5 max-md:hover:bg-transparent',
    className,
  );
  if (download) {
    return (
      <a href={href} download className={cls}>
        {body}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

/** Группа строк-ссылок внутри панели. */
export function LinkRows({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col divide-y divide-border max-md:divide-m-hair', className)}>
      {children}
    </div>
  );
}
