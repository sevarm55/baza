import Link from 'next/link';
import type { ReactNode } from 'react';
import { ChevronLeft } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Липкая шапка корневого экрана: где я и что можно сделать.
 *
 * Слева адрес того, на что смотришь, — филиал. Справа действия, которых
 * ровно столько, сколько нужно: колокольчик и учётка. Названия страницы
 * здесь нет намеренно: на корневом экране его говорит вкладка внизу, а
 * заголовок над заголовком — вторая шапка.
 *
 * Полупрозрачная с размытием: содержимое должно уходить ПОД шапку при
 * прокрутке, а не обрываться под ней ножом.
 */
export function MobileTopBar({
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
      className={cn(
        'sticky top-0 z-30 md:hidden',
        'border-b border-m-hair bg-m-board/92 backdrop-blur-xl',
        'supports-backdrop-filter:bg-m-board/78',
        className,
      )}
      style={{ paddingTop: 'var(--m-safe-top)' }}
    >
      <div className="m-pad-x flex h-[var(--m-top-h)] items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center">{left}</div>
        {right && <div className="flex shrink-0 items-center gap-1">{right}</div>}
      </div>
    </header>
  );
}

/**
 * Шапка вложенного экрана: «← Название».
 *
 * Ровно так открываются разделы в приложении, и ровно этого ждёт рука:
 * стрелка стоит в левом верхнем углу, у большого пальца, и всегда ведёт
 * на один уровень вверх — туда, откуда сюда пришли.
 *
 * Адрес возврата задаётся явно, а не берётся из истории браузера.
 * `history.back()` уводит с сайта у того, кто открыл раздел по ссылке из
 * переписки, и это единственный случай, когда «назад» ведёт не назад.
 */
export function MobileBackHeader({
  href,
  title,
  subtitle,
  action,
  className,
  backLabel,
}: {
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** одно действие в правом углу: «добавить», «править» */
  action?: ReactNode;
  className?: string;
  /** подпись стрелки для читалки экрана */
  backLabel: string;
}) {
  return (
    <header
      data-slot="m-back"
      className={cn(
        'sticky top-0 z-30 md:hidden',
        'border-b border-m-hair bg-m-board/92 backdrop-blur-xl',
        'supports-backdrop-filter:bg-m-board/78',
        className,
      )}
      style={{ paddingTop: 'var(--m-safe-top)' }}
    >
      <div className="m-pad-x flex min-h-[var(--m-top-h)] items-center gap-1.5 py-1.5">
        <Link
          href={href}
          aria-label={backLabel}
          className="m-press -ml-2.5 flex size-10 shrink-0 items-center justify-center rounded-m-chip text-primary outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronLeft aria-hidden className="size-6" strokeWidth={2.25} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[16px] leading-tight font-semibold text-m-ink">{title}</div>
          {subtitle && (
            <div className="truncate text-[11.5px] leading-tight text-m-muted">{subtitle}</div>
          )}
        </div>

        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
    </header>
  );
}

/**
 * Крупный заголовок внутри прокрутки — как на экране «Ещё».
 *
 * Повтор имени вкладки здесь не лишний: вкладка это где я нахожусь,
 * заголовок — с чего начинается страница. Но он остаётся заголовком, а
 * не витриной: тридцать два пункта, подпись под ним и никакого воздуха
 * сверх нужного.
 */
export function MobileTitle({
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
    <div className={cn('flex items-end gap-3 px-1 pt-1 pb-1', className)}>
      <div className="min-w-0 flex-1">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-0.02em] text-m-ink">
          {title}
        </h1>
        {lead && <p className="mt-0.5 text-[14px] leading-snug text-m-muted">{lead}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-1 pb-1">{action}</div>}
    </div>
  );
}

/**
 * Круглая кнопка-значок в шапке.
 *
 * Тридцать восемь точек — минимум, по которому уверенно попадают
 * пальцем; область касания при этом больше самого значка.
 */
export function MobileIconButton({
  children,
  className,
  tone = 'quiet',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'quiet' | 'grape' }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'm-press relative flex size-[38px] shrink-0 items-center justify-center rounded-m-tile',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        tone === 'quiet' && 'bg-m-inset text-m-ink',
        tone === 'grape' && 'bg-primary/10 text-primary',
        '[&_svg]:size-[17px]',
        className,
      )}
    >
      {children}
    </button>
  );
}
