'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Шапка корневого экрана: кто смотрит, куда смотрит, что нового.
 *
 * Тонкая строка сверху — не заголовок, а контекст: филиал слева,
 * колокольчик и учётка справа. Название экрана живёт под ней крупным
 * заголовком, и это единственное место, где оно звучит.
 *
 * Строка прибита к верху и получает материал: содержимое должно уходить
 * под неё при прокрутке, а не обрываться ножом.
 */
export function MTopBar({
  left,
  right,
  className,
}: {
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      data-slot="m-topbar"
      className={cn('m-glass sticky top-0 z-30 md:hidden', className)}
      style={{ paddingTop: 'var(--m-safe-top)' }}
    >
      <div className="m-pad-x flex h-[var(--m-top-h)] items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center">{left}</div>
        {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
    </header>
  );
}

/**
 * Шапка вложенного экрана: круглая стрелка, название по центру, одно
 * действие справа.
 *
 * Название по центру, а не слева: на вложенном экране оно отвечает на
 * вопрос «что я открыл», и центр — то место, куда глаз идёт первым,
 * когда экран сменился. По краям остаются две круглые кнопки, и они
 * симметричны: пустое место справа держит `aria-hidden` распорка, иначе
 * название съезжало бы от экрана к экрану.
 *
 * Адрес возврата задаётся явно, а не берётся из истории браузера:
 * `history.back()` уводит с сайта того, кто открыл раздел по ссылке из
 * переписки, и это единственный случай, когда «назад» ведёт не назад.
 */
export function MNav({
  href,
  title,
  subtitle,
  action,
  backLabel,
  className,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** одно действие в правом углу: «добавить», «править» */
  action?: ReactNode;
  backLabel: string;
  className?: string;
}) {
  return (
    <header
      data-slot="m-nav"
      className={cn('m-glass sticky top-0 z-30 md:hidden', className)}
      style={{ paddingTop: 'var(--m-safe-top)' }}
    >
      <div className="m-pad-x flex min-h-[var(--m-top-h)] items-center gap-2 py-2">
        <Link
          href={href}
          aria-label={backLabel}
          className={cn(
            'm-press flex size-11 shrink-0 items-center justify-center rounded-full bg-m-tile',
            'text-m-ink outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40',
          )}
        >
          <ChevronLeft aria-hidden className="size-[22px]" strokeWidth={2.2} />
        </Link>

        <div className="min-w-0 flex-1 text-center">
          <div className="truncate text-[17px] leading-tight font-bold tracking-[-0.01em] text-m-ink">
            {title}
          </div>
          {subtitle && (
            <div className="truncate text-[12px] leading-tight text-m-muted">{subtitle}</div>
          )}
        </div>

        {action ?? <span aria-hidden className="size-11 shrink-0" />}
      </div>
    </header>
  );
}

/**
 * Крупный заголовок экрана и строка контекста под ним.
 *
 * Тридцать два пункта — не витрина, а иерархия: экран отвечает на один
 * вопрос, и его название должно прочитаться раньше всего остального.
 * Строка под ним говорит, за какой отрезок эти числа и сколько сейчас
 * времени, — без неё крупное число внизу принадлежит неизвестно чему.
 */
export function MTitle({
  title,
  lead,
  action,
  className,
}: {
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-start gap-3 px-1 pt-1', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[30px] leading-[1.1] font-bold tracking-[-0.03em] text-m-ink">
          {title}
        </h1>
        {lead && <p className="mt-1 text-[13.5px] leading-snug text-m-muted">{lead}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1.5">{action}</div>}
    </div>
  );
}
