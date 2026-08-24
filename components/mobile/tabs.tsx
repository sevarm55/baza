'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useSyncExternalStore, type ComponentType } from 'react';
import { ChartNoAxesColumn, ClipboardList, Ellipsis, Plus, Wallet } from 'lucide-react';

import { usePendingTab } from '@/components/use-pending-tab';
import { isTabsVariant, TABS_COOKIE, type TabsVariant } from '@/components/mobile/tabs-shared';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Полоса вкладок — главный предмет мобильной оболочки.
 *
 * Материалов у неё пять, и человек выбирает сам: одному фиолетовая
 * капсула кажется тяжёлой, другому белая — незаметной. Разница между
 * вариантами ТОЛЬКО в материале и в том, чем помечена открытая вкладка;
 * состав, порядок и поведение общие: четыре раздела и кнопка записи
 * посередине.
 *
 * Запись стоит в середине, потому что это единственное действие,
 * которое повторяют по сорок раз за смену: середина нижнего края — то
 * место экрана, куда большой палец попадает не глядя.
 *
 * Мойщик полосы не видит вовсе: разделов у него нет, переключаться ему
 * не с чего, и полоса из одной кнопки отняла бы у него низ экрана, на
 * котором он сорок раз за смену жмёт «записать».
 *
 * Выбранный вариант живёт в cookie, а не только в браузере: сервер
 * читает её и отдаёт полосу сразу нужной. Без этого каждая полная
 * перезагрузка показывала бы вспышку варианта по умолчанию.
 */
const STORE_KEY = 'tetr.tabs';

/**
 * Какой вариант сейчас выбран.
 *
 * Сервер об этом не знает, поэтому первая отрисовка всегда идёт
 * вариантом по умолчанию, а выбранный встаёт сразу после гидратации:
 * иначе разметка сервера и браузера разошлись бы, и React переписал бы
 * всё дерево полосы.
 *
 * Адрес сильнее хранилища: `?tabs=ink` показывает вариант и запоминает
 * его, чтобы дальше по продукту можно было ходить обычными ссылками.
 */
export function useTabsVariant(initial: TabsVariant = 'grape'): [
  TabsVariant,
  (next: TabsVariant) => void,
] {
  /* `useSyncExternalStore`, а не состояние с эффектом: вариант живёт вне
     React — в адресе, в cookie и в `localStorage`, — и читать его надо
     ровно в тот момент, когда React рисует. Состояние, обновляемое из
     эффекта, дало бы лишний каскад отрисовок на каждом переходе. */
  const server = useCallback(() => initial, [initial]);
  const variant = useSyncExternalStore(subscribeTabs, readTabs, server);

  /* Адрес сильнее хранилища: `?tabs=ink` показывает вариант и запоминает
     его, чтобы дальше по продукту можно было ходить обычными ссылками. */
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('tabs');
    if (isTabsVariant(fromUrl)) saveTabs(fromUrl);
  }, [variant]);

  return [variant, pickTabs];
}

function readTabs(): TabsVariant {
  const fromUrl = new URLSearchParams(window.location.search).get('tabs');
  if (isTabsVariant(fromUrl)) return fromUrl;

  const fromCookie = document.cookie
    .split('; ')
    .find((row) => row.startsWith(`${TABS_COOKIE}=`))
    ?.slice(TABS_COOKIE.length + 1);
  if (isTabsVariant(fromCookie)) return fromCookie;

  const saved = window.localStorage.getItem(STORE_KEY);
  return isTabsVariant(saved) ? saved : 'grape';
}

/* Полос на странице одна, а переключателей может быть несколько: общее
   событие держит их в согласии без общего состояния. */
function subscribeTabs(onChange: () => void) {
  window.addEventListener('tetr:tabs', onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener('tetr:tabs', onChange);
    window.removeEventListener('storage', onChange);
  };
}

function saveTabs(next: TabsVariant) {
  window.localStorage.setItem(STORE_KEY, next);
  /* Год: выбор внешнего вида человек делает один раз, и переспрашивать
     его каждую неделю нечестно. Ничего личного в cookie нет, поэтому
     она обычная, без подписи. */
  document.cookie = `${TABS_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
}

function pickTabs(next: TabsVariant) {
  saveTabs(next);
  window.dispatchEvent(new Event('tetr:tabs'));
}

/** Подпись варианта в переключателе. */
export function tabsVariantLabel(variant: TabsVariant, t: ReturnType<typeof useT>): string {
  switch (variant) {
    case 'grape':
      return t.phone.tabsGrape;
    case 'light':
      return t.phone.tabsLight;
    case 'bar':
      return t.phone.tabsBar;
    case 'ink':
      return t.phone.tabsInk;
    case 'pill':
      return t.phone.tabsPill;
  }
}

type Tab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
};

export function MTabBar({ initial = 'grape' }: { initial?: TabsVariant }) {
  const t = useT();
  const pathname = usePathname();
  const [variant] = useTabsVariant(initial);

  const tabs: Tab[] = [
    { href: '/owner', label: t.phone.tabSummary, icon: ChartNoAxesColumn },
    { href: '/work', label: t.phone.tabShift, icon: ClipboardList },
    { href: '/owner/payroll', label: t.phone.tabPayroll, icon: Wallet },
    { href: '/owner/more', label: t.phone.tabMore, icon: Ellipsis },
  ];

  const current = currentTab(pathname);
  const { active, select } = usePendingTab(current);

  /* Место в конце прокрутки отводит оболочка по этой переменной: у
     полосы во всю ширину высота своя, и содержимое обязано кончаться
     над ней, а не под ней. */
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty(
      '--m-tabs-block',
      variant === 'bar' ? '58px' : 'calc(var(--m-tab-h) + var(--m-tab-gap) * 2)',
    );
  }, [variant]);

  const shared = { tabs, active, select, addLabel: t.phone.tabAdd, aria: t.phone.tabsAria };

  if (variant === 'bar') return <BarTabs {...shared} />;
  if (variant === 'light') return <CapsuleTabs {...shared} tone="light" />;
  if (variant === 'ink') return <CapsuleTabs {...shared} tone="ink" />;
  if (variant === 'pill') return <PillTabs {...shared} />;
  return <CapsuleTabs {...shared} tone="grape" />;
}

type Shared = {
  tabs: Tab[];
  active: string;
  select: (href: string) => void;
  addLabel: string;
  aria: string;
};

/** Общая оболочка плавающих вариантов: капсула по центру над листом. */
function Floating({
  aria,
  className,
  lift,
  children,
}: {
  aria: string;
  className?: string;
  /** своя тень: белой капсуле на белом листе общей не хватает */
  lift?: string;
  children: React.ReactNode;
}) {
  return (
    <nav
      aria-label={aria}
      data-slot="m-tabs"
      className="fixed inset-x-0 z-40 flex justify-center px-4 md:hidden"
      style={{ bottom: 'calc(var(--m-safe-bottom) + var(--m-tab-gap))' }}
    >
      <div
        className={cn(
          'flex h-[var(--m-tab-h)] max-w-full min-w-0 items-center gap-1 rounded-full px-2.5',
          className,
        )}
        style={{ boxShadow: lift ?? 'var(--m-lift)' }}
      >
        {children}
      </div>
    </nav>
  );
}

/**
 * Капсула в трёх материалах: грейп, белый лист, графит.
 *
 * Открытая вкладка помечена по-разному, и это главное различие: у
 * грейпа и графита значок белый с лаймовой точкой под ним, у светлой —
 * грейповый значок на сиреневом круге. Точка на белом не читается,
 * круг на цветном материале — тоже.
 */
function CapsuleTabs({
  tabs,
  active,
  select,
  addLabel,
  aria,
  tone,
}: Shared & { tone: 'grape' | 'light' | 'ink' }) {
  const dark = tone !== 'light';

  return (
    <Floating
      aria={aria}
      className={cn(
        tone === 'grape' && 'bg-m-grape',
        tone === 'ink' && 'bg-[#170b2b]',
        tone === 'light' && 'border border-m-hair bg-m-bg',
      )}
      lift={
        tone === 'light'
          ? '0 22px 48px -20px rgb(23 11 43 / 0.34), 0 4px 14px -6px rgb(23 11 43 / 0.16)'
          : undefined
      }
    >
      {tabs.map((tab, index) => {
        const selected = active === tab.href;
        const Icon = tab.icon;
        return (
          <span key={tab.href} className="flex items-center">
            {index === tabs.length / 2 && <AddButton label={addLabel} tone="lime" />}
            <Link
              href={tab.href}
              onClick={() => select(tab.href)}
              aria-label={tab.label}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'm-press relative flex size-12 items-center justify-center rounded-full outline-none',
                'transition-colors duration-150',
                dark
                  ? selected
                    ? 'text-white focus-visible:ring-2 focus-visible:ring-m-lime/70'
                    : 'text-white/55 focus-visible:ring-2 focus-visible:ring-m-lime/70'
                  : selected
                    ? 'bg-m-grape/12 text-m-grape focus-visible:ring-2 focus-visible:ring-m-grape/40'
                    : 'text-m-faint focus-visible:ring-2 focus-visible:ring-m-grape/40',
              )}
            >
              <Icon aria-hidden className="size-[22px]" strokeWidth={selected ? 2.4 : 1.9} />
              {dark && (
                <span
                  aria-hidden
                  className={cn(
                    'absolute bottom-1.5 size-1 rounded-full bg-m-lime transition-opacity duration-150',
                    selected ? 'opacity-100' : 'opacity-0',
                  )}
                />
              )}
            </Link>
          </span>
        );
      })}
    </Floating>
  );
}

/**
 * Белая капсула, где открытая вкладка — лаймовая пилюля с подписью.
 *
 * Подпись есть ровно у одной вкладки, и место под неё берётся у
 * остальных: так полоса и называет раздел словом, и остаётся узкой.
 * Кнопка записи грейповая — лайм на экране уже занят.
 */
function PillTabs({ tabs, active, select, addLabel, aria }: Shared) {
  return (
    <Floating aria={aria} className="border border-m-hair bg-m-bg">
      {tabs.map((tab, index) => {
        const selected = active === tab.href;
        const Icon = tab.icon;
        return (
          <span key={tab.href} className="flex items-center">
            {index === tabs.length / 2 && <AddButton label={addLabel} tone="grape" />}
            <Link
              href={tab.href}
              onClick={() => select(tab.href)}
              aria-label={tab.label}
              aria-current={selected ? 'page' : undefined}
              className={cn(
                'm-press flex h-12 items-center gap-2 rounded-full outline-none transition-all duration-200',
                'focus-visible:ring-2 focus-visible:ring-m-grape/40',
                selected ? 'min-w-0 bg-m-lime px-3 text-[#170b2b]' : 'w-12 shrink-0 justify-center text-m-faint',
              )}
            >
              <Icon aria-hidden className="size-[22px] shrink-0" strokeWidth={selected ? 2.4 : 1.9} />
              {selected && (
                <span className="max-w-[78px] truncate text-[13.5px] font-bold">{tab.label}</span>
              )}
            </Link>
          </span>
        );
      })}
    </Floating>
  );
}

/**
 * Полоса во всю ширину с подписями под значками.
 *
 * Самый привычный вариант: то же, что в родных приложениях телефона.
 * Материал вместо заливки — содержимое уходит под полосу, а не
 * обрывается под ней; кнопка записи выступает над ней кругом, и лист
 * виден в вырезе вокруг него.
 */
function BarTabs({ tabs, active, select, addLabel, aria }: Shared) {
  return (
    <nav
      aria-label={aria}
      data-slot="m-tabs"
      className="m-glass fixed inset-x-0 bottom-0 z-40 border-t border-m-hair md:hidden"
      style={{ paddingBottom: 'var(--m-safe-bottom)' }}
    >
      <ul className="mx-auto flex h-[58px] max-w-md items-stretch">
        {tabs.flatMap((tab, index) => {
          const selected = active === tab.href;
          const Icon = tab.icon;
          const cell = (
            <li key={tab.href} className="min-w-0 flex-1">
              <Link
                href={tab.href}
                onClick={() => select(tab.href)}
                aria-current={selected ? 'page' : undefined}
                className={cn(
                  'm-press flex h-full flex-col items-center justify-center gap-1 rounded-m-chip outline-none',
                  'focus-visible:ring-2 focus-visible:ring-m-grape/40',
                  selected ? 'text-m-grape' : 'text-m-faint',
                )}
              >
                <Icon aria-hidden className="size-[21px]" strokeWidth={selected ? 2.4 : 1.9} />
                <span
                  className={cn(
                    'max-w-full truncate px-1 text-[10.5px] leading-none',
                    selected ? 'font-bold' : 'font-medium',
                  )}
                >
                  {tab.label}
                </span>
              </Link>
            </li>
          );

          /* Кнопка записи занимает собственную клетку посередине ряда:
             без неё две соседние вкладки сошлись бы под её кругом. */
          if (index !== tabs.length / 2) return [cell];
          return [
            <li key="add" className="flex w-[76px] shrink-0 items-start justify-center">
              <AddButton label={addLabel} tone="lime" className="-translate-y-4 ring-4 ring-m-bg" />
            </li>,
            cell,
          ];
        })}
      </ul>
    </nav>
  );
}

/** Запись машины: круг крупнее вкладок, потому что действие главнее раздела. */
function AddButton({
  label,
  tone,
  className,
}: {
  label: string;
  tone: 'lime' | 'grape';
  className?: string;
}) {
  return (
    <Link
      href="/work?add=1"
      aria-label={label}
      className={cn(
        'm-press mx-1 flex size-14 shrink-0 items-center justify-center rounded-full outline-none',
        tone === 'lime'
          ? 'bg-m-lime text-[#170b2b] focus-visible:ring-2 focus-visible:ring-m-grape/40'
          : 'bg-m-grape text-white focus-visible:ring-2 focus-visible:ring-m-grape/40',
        className,
      )}
      style={{
        boxShadow:
          tone === 'lime'
            ? '0 6px 18px -6px rgb(213 255 2 / 0.65)'
            : '0 6px 18px -6px rgb(71 27 140 / 0.55)',
      }}
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
