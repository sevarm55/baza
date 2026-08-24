import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Коробка списка: белая бумага, общее скругление, волосяная грань.
 *
 * Несколько коробок подряд, а не одна на всё: список из восьми строк
 * читается таблицей, где всё равнозначно. Разрыв между коробками и есть
 * ответ на вопрос «где работа, где бизнес, где я сам» — его видно
 * раньше, чем прочитано первое слово.
 */
export function MobileGroup({
  title,
  children,
  className,
  action,
}: {
  /** тихая подпись над коробкой */
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col', className)}>
      {(title || action) && (
        <div className="flex items-center gap-2 px-1 pb-1.5">
          {title && <h2 className="text-[13px] font-semibold text-m-muted">{title}</h2>}
          {action && <div className="ml-auto flex shrink-0 items-center">{action}</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-m-card border border-m-hair bg-m-surface">
        {children}
      </div>
    </div>
  );
}

/**
 * Лицо строки списка.
 *
 * Значок без плашки под ним: плашка — ещё один прямоугольник, а их в
 * коробке и так по одному на строку. Цвет раздела при этом остаётся —
 * он перешёл с заливки на сам знак, и в столбце из четырёх строк по
 * нему находят нужную раньше, чем прочитано слово.
 *
 * Шестьдесят точек высоты: минимальная цель, по которой уверенно
 * попадают мокрым пальцем.
 *
 * Волосяная линия между строками отбита под текст, а не под значок:
 * линия под значком разрезала бы коробку пополам.
 */
function RowFace({
  icon,
  iconClass,
  title,
  note,
  right,
  chevron = true,
}: {
  icon?: ReactNode;
  iconClass?: string;
  title: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <>
      {icon && (
        <span
          aria-hidden
          className={cn(
            'flex w-7 shrink-0 items-center justify-center [&_svg]:size-[19px]',
            iconClass ?? 'text-m-muted',
          )}
        >
          {icon}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-px text-left">
        <span className="truncate text-[16px] leading-tight font-semibold text-m-ink">{title}</span>
        {note !== undefined && note !== null && note !== '' && (
          <span className="line-clamp-2 text-[12.5px] leading-snug text-m-muted">{note}</span>
        )}
      </span>
      {right && <span className="shrink-0 text-[13px] text-m-muted">{right}</span>}
      {chevron && (
        <ChevronRight aria-hidden className="size-4 shrink-0 text-m-muted" strokeWidth={2.25} />
      )}
    </>
  );
}

const ROW =
  'm-press flex w-full min-h-[60px] items-center gap-3 px-4 py-2.5 text-left' +
  ' outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:-outline-offset-2' +
  ' [&+*]:border-t [&+*]:border-m-hair';

/** Строка-переход. */
export function MobileLinkRow({
  href,
  icon,
  iconClass,
  title,
  note,
  right,
  chevron = true,
  className,
  ...rest
}: Omit<ComponentProps<typeof Link>, 'title'> & {
  icon?: ReactNode;
  iconClass?: string;
  title: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <Link href={href} {...rest} className={cn(ROW, className)}>
      <RowFace
        icon={icon}
        iconClass={iconClass}
        title={title}
        note={note}
        right={right}
        chevron={chevron}
      />
    </Link>
  );
}

/** Строка-действие: выход, возврат настройки, повтор. */
export function MobileButtonRow({
  icon,
  iconClass,
  title,
  note,
  right,
  chevron = false,
  className,
  ...rest
}: Omit<ComponentProps<'button'>, 'title'> & {
  icon?: ReactNode;
  iconClass?: string;
  title: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
  chevron?: boolean;
}) {
  return (
    <button type="button" {...rest} className={cn(ROW, className)}>
      <RowFace
        icon={icon}
        iconClass={iconClass}
        title={title}
        note={note}
        right={right}
        chevron={chevron}
      />
    </button>
  );
}

/** Строка без перехода: значение, переключатель, поле. */
export function MobileRow({
  icon,
  iconClass,
  title,
  note,
  right,
  className,
}: {
  icon?: ReactNode;
  iconClass?: string;
  title: ReactNode;
  note?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex min-h-[56px] w-full items-center gap-3 px-4 py-2.5',
        '[&+*]:border-t [&+*]:border-m-hair',
        className,
      )}
    >
      <RowFace
        icon={icon}
        iconClass={iconClass}
        title={title}
        note={note}
        right={right}
        chevron={false}
      />
    </div>
  );
}

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
