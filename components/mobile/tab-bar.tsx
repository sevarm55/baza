'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Banknote, ChartNoAxesCombined, ClipboardList, Ellipsis } from 'lucide-react';

import { usePendingTab } from '@/components/use-pending-tab';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Полоса вкладок внизу экрана — та же, что в приложении.
 *
 * Четыре вкладки и ни одной больше: во вкладках живёт то, что открывают
 * каждый день. Прейскурант правят раз в месяц, филиалы заводят раз в
 * год — им место в «Ещё», а не под пальцем.
 *
 * Мойщик видит одну вкладку и не видит полосы вовсе: у него нет
 * разделов, переключаться ему не с чего, и полоса из одной кнопки
 * отбирала бы у него пятьдесят шесть точек экрана, на котором он сорок
 * раз за смену жмёт «записать».
 *
 * Прибита к низу, поверх содержимого, с полем под домашнюю черту.
 * Место в конце прокрутки под неё отводит `MobilePage`.
 */
export function MobileTabBar({ passes: _passes }: { passes?: boolean } = {}) {
  const t = useT();
  const pathname = usePathname();

  const tabs = [
    { href: '/work', label: t.phone.tabShift, icon: ClipboardList },
    { href: '/owner', label: t.phone.tabSummary, icon: ChartNoAxesCombined },
    { href: '/owner/payroll', label: t.phone.tabPayroll, icon: Banknote },
    { href: '/owner/more', label: t.phone.tabMore, icon: Ellipsis },
  ];

  /* «Вы находитесь здесь» — по самому длинному совпадению, как в
     колонке разделов. Сводка совпадает только точно, иначе она
     побеждала бы на каждом адресе кабинета. Всё, чего нет во вкладках,
     принадлежит «Ещё»: человек, ушедший в расходы, должен видеть, из
     какой вкладки он туда попал. */
  const current = currentTab(pathname);
  const { active, pending, select } = usePendingTab(current);

  return (
    <nav
      aria-label={t.phone.tabsAria}
      data-slot="m-tabs"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 md:hidden',
        'border-t border-m-hair bg-m-surface/92 backdrop-blur-xl',
        'supports-backdrop-filter:bg-m-surface/80',
      )}
      style={{ paddingBottom: 'var(--m-safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[var(--m-tab-h)] max-w-lg items-stretch px-1">
        {tabs.map((tab) => {
          const selected = active === tab.href;
          const Icon = tab.icon;
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                onClick={() => select(tab.href)}
                aria-current={selected ? 'page' : undefined}
                data-pending={pending && selected ? '' : undefined}
                className={cn(
                  'group flex h-full min-w-0 flex-col items-center justify-center gap-0.5 rounded-m-chip',
                  'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                  selected ? 'text-primary' : 'text-m-muted',
                )}
              >
                {/* Сирень под выбранной вкладкой — та же плашка, что
                    рисует система в приложении. Не грейп в полную силу:
                    на нём грейповый значок пропал бы. */}
                <span
                  className={cn(
                    'flex h-7 w-14 items-center justify-center rounded-m-pill transition-colors duration-150',
                    selected && 'bg-primary/14',
                  )}
                >
                  <Icon aria-hidden className="size-[19px]" strokeWidth={selected ? 2.25 : 1.9} />
                </span>
                <span
                  className={cn(
                    'max-w-full truncate px-1 text-[10.5px] leading-none',
                    selected ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Какая вкладка подсвечена на этом адресе.
 *
 * Разделы, которых во вкладках нет, принадлежат «Ещё» — там их и
 * открывали. Экран смены отдельный: на него ведёт и кнопка из сводки.
 */
function currentTab(pathname: string): string {
  if (pathname === '/work' || pathname.startsWith('/work/')) return '/work';
  if (pathname === '/owner') return '/owner';
  if (pathname.startsWith('/owner/payroll')) return '/owner/payroll';
  return '/owner/more';
}
