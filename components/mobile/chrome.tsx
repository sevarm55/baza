'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import {
  ChartNoAxesColumn,
  ChevronLeft,
  ClipboardList,
  Ellipsis,
  Plus,
  Wallet,
} from 'lucide-react';

import { usePendingTab } from '@/components/use-pending-tab';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Плавающая полоса вкладок — главный предмет мобильной оболочки.
 *
 * Не прибитая ко дну панель во всю ширину, а капсула, лежащая НА листе:
 * лист виден под ней и по её краям, и от этого экран не кончается
 * панелью, а продолжается за неё.
 *
 * Внутри четыре раздела и лаймовая кнопка записи между ними. Запись
 * стоит в середине, потому что это единственное действие, которое
 * повторяют по сорок раз за смену: середина нижнего края — то место
 * экрана, куда большой палец попадает не глядя.
 *
 * Подписей под значками нет: капсула из четырёх слов и кнопки не влезла
 * бы в триста семьдесят пять точек, не превратив слова в огрызки. Где
 * человек находится, говорит крупный заголовок экрана, а во вкладке —
 * лаймовая точка под значком.
 *
 * Мойщик полосы не видит вовсе: разделов у него нет, переключаться ему
 * не с чего, и капсула из одной кнопки отняла бы у него низ экрана, на
 * котором он сорок раз за смену жмёт «записать».
 */
export function MTabBar() {
  const t = useT();
  const pathname = usePathname();

  const tabs = [
    { href: '/owner', label: t.phone.tabSummary, icon: ChartNoAxesColumn },
    { href: '/work', label: t.phone.tabShift, icon: ClipboardList },
    { href: '/owner/payroll', label: t.phone.tabPayroll, icon: Wallet },
    { href: '/owner/more', label: t.phone.tabMore, icon: Ellipsis },
  ];

  const current = currentTab(pathname);
  const { active, select } = usePendingTab(current);

  return (
    <nav
      aria-label={t.phone.tabsAria}
      data-slot="m-tabs"
      className="fixed inset-x-0 z-40 flex justify-center md:hidden"
      style={{ bottom: 'calc(var(--m-safe-bottom) + var(--m-tab-gap))' }}
    >
      <div
        className="flex h-[var(--m-tab-h)] items-center gap-1 rounded-full bg-m-grape px-2.5"
        style={{ boxShadow: 'var(--m-lift)' }}
      >
        {tabs.map((tab, index) => {
          const selected = active === tab.href;
          const Icon = tab.icon;
          const half = tabs.length / 2;
          return (
            <span key={tab.href} className="flex items-center">
              {index === half && <QuickAdd label={t.phone.tabAdd} />}
              <Link
                href={tab.href}
                onClick={() => select(tab.href)}
                aria-label={tab.label}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'm-press relative flex size-12 items-center justify-center rounded-full outline-none',
                  'transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-m-lime/70',
                  selected ? 'text-white' : 'text-white/55',
                )}
              >
                <Icon aria-hidden className="size-[22px]" strokeWidth={selected ? 2.4 : 1.9} />
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-1.5 size-1 rounded-full bg-m-lime transition-opacity duration-150',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
              </Link>
            </span>
          );
        })}
      </div>
    </nav>
  );
}

/**
 * Запись машины — лаймовый круг посреди полосы.
 *
 * Он крупнее вкладок и выступает над капсулой: главное действие обязано
 * отличаться формой, а не только цветом. Лайм здесь единственный на
 * экране, и потому его невозможно перепутать с разделом.
 */
function QuickAdd({ label }: { label: string }) {
  return (
    <Link
      href="/work?add=1"
      aria-label={label}
      className={cn(
        'm-press mx-1 flex size-14 shrink-0 items-center justify-center rounded-full',
        'bg-m-lime text-[#170b2b] outline-none focus-visible:ring-2 focus-visible:ring-white/70',
      )}
      style={{ boxShadow: '0 6px 18px -6px rgb(213 255 2 / 0.65)' }}
    >
      <Plus aria-hidden className="size-7" strokeWidth={2.6} />
    </Link>
  );
}

/**
 * Какая вкладка подсвечена на этом адресе.
 *
 * Разделы, которых во вкладках нет, принадлежат «Ещё» — оттуда их и
 * открывали, туда же ведёт и стрелка назад.
 */
function currentTab(pathname: string): string {
  if (pathname === '/work' || pathname.startsWith('/work/')) return '/work';
  if (pathname === '/owner') return '/owner';
  if (pathname.startsWith('/owner/payroll')) return '/owner/payroll';
  return '/owner/more';
}

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
