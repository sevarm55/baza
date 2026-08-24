import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Строка списка данных: две колонки слева и деньги справа.
 *
 * Так устроены ленты операций: список не читают, его просматривают.
 * Кружок слева опознаётся раньше слова, а деньги, стоящие всегда у
 * правого края на одной высоте, сравниваются между строками без чтения.
 */
export function MobileDataRow({
  lead,
  title,
  note,
  extra,
  value,
  sub,
  subQuiet,
  action,
  fresh = false,
  className,
}: {
  /** кружок с буквой, значок способа оплаты */
  lead?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  extra?: ReactNode;
  value?: ReactNode;
  sub?: ReactNode;
  subQuiet?: ReactNode;
  /** три точки или кнопка в конце строки */
  action?: ReactNode;
  /** только что приехала: короткая лаймовая вспышка */
  fresh?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start gap-3 rounded-m-chip px-1 py-2.5',
        fresh && 'm-fresh',
        className,
      )}
    >
      {lead && <div className="shrink-0 pt-0.5">{lead}</div>}

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-1.5">{title}</div>
        {note && <div className="truncate text-[12px] leading-snug text-m-muted">{note}</div>}
        {extra && (
          <div className="num truncate text-[11.5px] leading-snug text-m-muted/75">{extra}</div>
        )}
      </div>

      {(value || sub || subQuiet) && (
        <div className="flex shrink-0 flex-col items-end gap-0.5 text-right">
          {value && <div className="num text-[15px] leading-tight font-semibold text-m-ink">{value}</div>}
          {sub && <div className="num text-[12px] leading-tight text-m-muted">{sub}</div>}
          {subQuiet && (
            <div className="num text-[11.5px] leading-tight text-m-muted/75">{subQuiet}</div>
          )}
        </div>
      )}

      {action && <div className="-mr-1 shrink-0 self-center">{action}</div>}
    </div>
  );
}

/**
 * Журнал: строки прямо на полотне, разделённые волосяной линией.
 *
 * Без карточки вокруг: записей за смену сорок, и коробка вокруг каждой
 * превратила бы список в стопку.
 */
export function MobileDataList({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col [&>*+*]:border-t [&>*+*]:border-m-hair', className)}>
      {children}
    </div>
  );
}

/**
 * Кружок с буквой — лицо человека в списке.
 *
 * Один и тот же работник всегда одного цвета: в ленте, в списке на
 * смене, в истории дня. Цвет берётся из имени и одинаков на всех
 * устройствах — тем же кодом, что в приложении.
 */
export function MobileAvatar({
  name,
  color,
  size = 34,
  present = false,
  dim = false,
  className,
}: {
  name: string;
  /** `personColor(name)` — cчитается на сервере */
  color: string;
  size?: number;
  /** зелёная точка «сейчас здесь» */
  present?: boolean;
  /** отработал и ушёл: кружок гаснет */
  dim?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className="flex items-center justify-center rounded-full font-bold text-white"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.41),
          background: dim ? 'var(--m-inset)' : color,
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {present && (
        <span
          className="absolute -right-px -bottom-px rounded-full border-2 border-m-surface bg-m-good"
          style={{ width: size * 0.31, height: size * 0.31 }}
        />
      )}
    </span>
  );
}
