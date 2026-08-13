import type { ReactNode } from 'react';
import {
  Banknote,
  CarFront,
  ChartNoAxesCombined,
  FileChartColumn,
  ReceiptText,
  SlidersHorizontal,
  TicketCheck,
  Users,
} from 'lucide-react';
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

export const SECTIONS: Section[] = [
  {
    href: '/owner',
    label: hy.owner.tabToday,
    // столбики: то же, что рисует график дня
    icon: <ChartNoAxesCombined aria-hidden="true" />,
  },
  {
    href: '/owner/payroll',
    label: hy.owner.tabPayroll,
    // купюра
    icon: <Banknote aria-hidden="true" />,
  },
  {
    href: '/owner/expenses',
    label: hy.expenses.title,
    // стрелка вниз: деньги уходят
    icon: <ReceiptText aria-hidden="true" />,
  },
  {
    href: '/owner/reports',
    label: hy.reports.title,
    /* Лист с полосками: отчёт — это сравнение, а не одно число. */
    icon: <FileChartColumn aria-hidden="true" />,
  },
  {
    href: '/owner/clients',
    label: hy.owner.tabClients,
    // машина сбоку — клиент здесь это номер на кузове
    icon: <CarFront aria-hidden="true" />,
  },
  {
    href: '/owner/passes',
    label: hy.passes.title,
    feature: 'passes',
    // талон
    icon: <TicketCheck aria-hidden="true" />,
  },
  {
    href: '/owner/staff',
    label: hy.settings.staff,
    /* Двое, а не один: раздел о людях во множественном числе, а
       одиночная фигура уже занята «моей страницей» внизу колонки. Два
       одинаковых значка в одном столбце — это не значки, а орнамент. */
    icon: <Users aria-hidden="true" />,
  },
  {
    href: '/owner/settings',
    label: hy.owner.tabSettings,
    // ползунки
    icon: <SlidersHorizontal aria-hidden="true" />,
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
