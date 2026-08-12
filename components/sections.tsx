import type { ReactNode } from 'react';
import { hy } from '@/lib/i18n/hy';

/**
 * Разделы кабинета — один список на два способа показать их.
 *
 * На компьютере это меню в боковой колонке, на телефоне — полоса
 * капсул сверху. Порядок, подписи и признак «только с абонементами»
 * должны совпадать: два списка в двух файлах разъезжаются на первом же
 * новом разделе, и человек, привыкший к порядку на телефоне, не найдёт
 * его на компьютере.
 *
 * Значок не украшение: в колонке из семи строк он находит нужную
 * раньше, чем взгляд успевает прочитать слово. Поэтому все они одного
 * рисунка — линия 1.5 по сетке 16, без заливок.
 */
export type Section = {
  href: string;
  label: string;
  icon: ReactNode;
  /** раздел живёт только при включённых абонементах */
  feature?: 'passes';
};

const S = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 16 16" className="size-[18px]" aria-hidden {...S}>
      {children}
    </svg>
  );
}

export const SECTIONS: Section[] = [
  {
    href: '/owner',
    label: hy.owner.tabToday,
    // столбики: то же, что рисует график дня
    icon: (
      <Icon>
        <path d="M3 13V9M6.33 13V4M9.67 13V7M13 13v-2.5" />
      </Icon>
    ),
  },
  {
    href: '/owner/payroll',
    label: hy.owner.tabPayroll,
    // купюра
    icon: (
      <Icon>
        <rect x="2" y="4" width="12" height="8" rx="1.5" />
        <circle cx="8" cy="8" r="1.75" />
      </Icon>
    ),
  },
  {
    href: '/owner/expenses',
    label: hy.expenses.title,
    // стрелка вниз: деньги уходят
    icon: (
      <Icon>
        <path d="M8 3v8.5M4.75 8.5 8 11.75l3.25-3.25" />
      </Icon>
    ),
  },
  {
    href: '/owner/clients',
    label: hy.owner.tabClients,
    // машина сбоку — клиент здесь это номер на кузове
    icon: (
      <Icon>
        <path d="M2.5 10.5h11M3.5 10.5V8l1.5-3h6l1.5 3v2.5" />
        <circle cx="5.25" cy="11.25" r="1" />
        <circle cx="10.75" cy="11.25" r="1" />
      </Icon>
    ),
  },
  {
    href: '/owner/passes',
    label: hy.passes.title,
    feature: 'passes',
    // талон
    icon: (
      <Icon>
        <rect x="2" y="4.5" width="12" height="7" rx="1.5" />
        <path d="M6 4.5v7" strokeDasharray="1.4 1.4" />
      </Icon>
    ),
  },
  {
    href: '/owner/staff',
    label: hy.settings.staff,
    /* Двое, а не один: раздел о людях во множественном числе, а
       одиночная фигура уже занята «моей страницей» внизу колонки. Два
       одинаковых значка в одном столбце — это не значки, а орнамент. */
    icon: (
      <Icon>
        <circle cx="6" cy="6" r="2.1" />
        <path d="M2 13c0-2.1 1.8-3.4 4-3.4s4 1.3 4 3.4" />
        <path d="M11 5.6a2.1 2.1 0 0 1 0 4M12.2 9.9c1.2.5 1.9 1.6 1.9 3.1" />
      </Icon>
    ),
  },
  {
    href: '/owner/settings',
    label: hy.owner.tabSettings,
    // ползунки
    icon: (
      <Icon>
        <path d="M2.5 5h11M2.5 11h11" />
        <circle cx="6" cy="5" r="1.5" />
        <circle cx="10.5" cy="11" r="1.5" />
      </Icon>
    ),
  },
];

/** Разделы, доступные этому бизнесу. */
export function sectionsFor(passes: boolean): Section[] {
  return SECTIONS.filter((s) => !s.feature || passes);
}

/**
 * Подпись открытого раздела — для заголовка страницы.
 *
 * По самому длинному совпадению, иначе `/owner` победил бы всех:
 * с него начинается каждый адрес кабинета.
 */
export function sectionTitle(pathname: string): string {
  const hit = [...SECTIONS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`));
  return hit?.label ?? hy.owner.tabToday;
}
