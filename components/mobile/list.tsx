import Link from 'next/link';
import type { ComponentType, ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';

import { cn } from '@/lib/utils';
import { MBadge } from './surface';

/**
 * Списки мобильного слоя — их ровно два вида, и путать их нельзя.
 *
 * `MRows` — плитки в столбик с зазором: так показывают предметы, у
 * которых есть своя жизнь (машина в журнале, человек, день, расход). У
 * каждого своя плитка, и каждую можно нажать.
 *
 * `MGroup` — одна плитка, внутри строки через волосяной разделитель:
 * так показывают настройки и переходы, у которых нет содержимого, кроме
 * названия. Это тот же inset-grouped список, что в настройках телефона,
 * и он опознаётся мгновенно.
 */
export function MRows({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn('flex flex-col gap-2', className)}>{children}</ul>;
}

export function MGroup({
  children,
  className,
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      {title && (
        <h2 className="px-1 text-[12px] font-semibold tracking-[0.06em] text-m-faint uppercase">
          {title}
        </h2>
      )}
      <ul
        className={cn(
          'flex flex-col overflow-hidden rounded-m-tile bg-m-tile',
          '[&>li+li]:border-t [&>li+li]:border-m-hair',
          className,
        )}
      >
        {children}
      </ul>
    </div>
  );
}

/**
 * Строка списка: кто слева, что посередине, сколько справа.
 *
 * Сумма справа набрана табличными цифрами и одним кеглем на весь
 * список: колонка сумм должна сравниваться взглядом, а не чтением.
 */
export function MRow({
  lead,
  title,
  note,
  extra,
  value,
  hint,
  trailing,
  href,
  onClick,
  tone = 'quiet',
  fresh,
  className,
}: {
  /** аватар, значок, номер — всё, что опознаёт предмет */
  lead?: ReactNode;
  title: ReactNode;
  note?: ReactNode;
  /** третья, самая тихая строка: время, состав бригады, пояснение */
  extra?: ReactNode;
  value?: ReactNode;
  /** приписка под суммой */
  hint?: ReactNode;
  /** кнопка действия или стрелка в правом краю */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  tone?: 'quiet' | 'plain' | 'bare';
  /** только что приехавшая строка: короткая лаймовая вспышка */
  fresh?: boolean;
  className?: string;
}) {
  const body = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15.5px] leading-tight font-semibold text-m-ink">
          {title}
        </span>
        {note && (
          <span className="mt-0.5 truncate text-[12.5px] leading-tight text-m-muted">{note}</span>
        )}
        {extra && (
          <span className="num mt-0.5 truncate text-[11.5px] leading-tight text-m-faint">
            {extra}
          </span>
        )}
      </span>
      {(value !== undefined || hint !== undefined) && (
        <span className="flex shrink-0 flex-col items-end">
          {value !== undefined && (
            <span className="num text-[15.5px] leading-tight font-bold text-m-ink">{value}</span>
          )}
          {hint !== undefined && (
            <span className="num mt-0.5 text-[11.5px] leading-tight text-m-faint">{hint}</span>
          )}
        </span>
      )}
      {trailing}
    </>
  );

  const shell = cn(
    'flex min-w-0 items-center gap-3 text-left',
    tone === 'quiet' && 'rounded-m-row bg-m-tile p-3.5',
    tone === 'plain' && 'rounded-m-row border border-m-hair bg-m-bg p-3.5',
    tone === 'bare' && 'px-4 py-3.5',
    fresh && 'm-fresh',
    className,
  );

  if (href) {
    return (
      <li className="min-w-0">
        <Link
          href={href}
          className={cn(
            shell,
            'm-press outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40',
          )}
        >
          {body}
        </Link>
      </li>
    );
  }

  if (onClick) {
    return (
      <li className="min-w-0">
        <button
          type="button"
          onClick={onClick}
          className={cn(
            shell,
            'm-press w-full outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40',
          )}
        >
          {body}
        </button>
      </li>
    );
  }

  return <li className={shell}>{body}</li>;
}

/**
 * Строка перехода в группе: значок, название, стрелка.
 *
 * Стрелка справа обязательна: в группе строки без стрелки — это
 * значение, а со стрелкой — дверь, и человек должен различать их не
 * нажимая.
 */
export function MNavRow({
  icon,
  title,
  note,
  value,
  href,
  onClick,
  className,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: ReactNode;
  note?: ReactNode;
  /** текущее значение справа: язык, тема, процент */
  value?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}) {
  const body = (
    <>
      {icon && <MBadge icon={icon} size="sm" />}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15.5px] leading-tight font-medium text-m-ink">{title}</span>
        {note && (
          <span className="mt-0.5 truncate text-[12px] leading-tight text-m-muted">{note}</span>
        )}
      </span>
      {value !== undefined && (
        <span className="num shrink-0 text-[14px] text-m-muted">{value}</span>
      )}
      <ChevronRight aria-hidden className="size-[18px] shrink-0 text-m-faint" strokeWidth={2} />
    </>
  );

  const shell = cn(
    'm-press flex min-w-0 items-center gap-3 px-4 py-3.5 text-left outline-none',
    'focus-visible:ring-2 focus-visible:ring-m-grape/40 focus-visible:ring-inset',
    className,
  );

  return (
    <li className="min-w-0">
      {href ? (
        <Link href={href} className={shell}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={onClick} className={cn(shell, 'w-full')}>
          {body}
        </button>
      )}
    </li>
  );
}

/**
 * Лицо человека: круг с буквой и точкой смены.
 *
 * Цвет круга — цвет человека, выведенный из имени: это единственное
 * место системы, где цвет не принадлежит марке, и он нужен, чтобы
 * различать людей в списке взглядом.
 */
export function MAvatar({
  name,
  color,
  size = 40,
  present,
  className,
}: {
  name: string;
  color?: string;
  size?: number;
  /** зелёная точка «на смене» в углу */
  present?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)} aria-hidden>
      <span
        className="flex items-center justify-center rounded-full font-bold text-white"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.4),
          background: color ?? 'var(--m-grape)',
        }}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
      {present && (
        <span
          className="absolute -right-0.5 -bottom-0.5 rounded-full border-2 border-m-bg bg-m-lime"
          style={{ width: size * 0.28, height: size * 0.28 }}
        />
      )}
    </span>
  );
}

/**
 * Стопка лиц: «кто на смене» одним предметом.
 *
 * Лица налезают друг на друга, потому что важно не «кто именно», а «их
 * трое»; имена стоят рядом строкой, когда их два или три.
 */
export function MAvatarStack({
  people,
  size = 30,
  max = 4,
  className,
}: {
  people: { name: string; color?: string }[];
  size?: number;
  max?: number;
  className?: string;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;

  return (
    <span className={cn('flex shrink-0 items-center', className)} aria-hidden>
      {shown.map((p, i) => (
        <span
          key={`${p.name}-${i}`}
          className="rounded-full border-2 border-m-bg"
          style={{ marginLeft: i === 0 ? 0 : -size * 0.3 }}
        >
          <MAvatar name={p.name} color={p.color} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="num flex items-center justify-center rounded-full border-2 border-m-bg bg-m-tile-strong font-bold text-m-muted"
          style={{ width: size, height: size, fontSize: size * 0.36, marginLeft: -size * 0.3 }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}
