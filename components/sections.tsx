import type { ReactNode } from 'react';
import type { Dict } from '@/lib/i18n';
import {
  Banknote,
  CarFront,
  ChartNoAxesCombined,
  FileChartColumn,
  ReceiptText,
  SlidersHorizontal,
  Tags,
  TicketCheck,
  Users,
} from 'lucide-react';

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

/**
 * Список разделов на языке того, кто смотрит.
 *
 * Раньше это была константа модуля. Стать функцией её заставил язык:
 * подписи приходят из словаря, а словарь у каждого человека свой, и
 * посчитанный один раз при загрузке модуля список остался бы навсегда на
 * том языке, кто первым открыл страницу после запуска сервера.
 *
 * Порядок, адреса и значки от языка не зависят и остаются здесь же —
 * два списка в двух файлах разъезжаются на первом же новом разделе.
 */
export function sections(t: Dict): Section[] {
  return [
  {
    href: '/owner',
    label: t.owner.tabToday,
    // столбики: то же, что рисует график дня
    icon: <ChartNoAxesCombined aria-hidden="true" />,
  },
  {
    href: '/owner/payroll',
    label: t.owner.tabPayroll,
    // купюра
    icon: <Banknote aria-hidden="true" />,
  },
  {
    href: '/owner/expenses',
    label: t.expenses.title,
    // стрелка вниз: деньги уходят
    icon: <ReceiptText aria-hidden="true" />,
  },
  {
    href: '/owner/reports',
    label: t.reports.title,
    /* Лист с полосками: отчёт — это сравнение, а не одно число. */
    icon: <FileChartColumn aria-hidden="true" />,
  },
  {
    href: '/owner/services',
    label: t.settings.tabServices,
    /* Ценники. Услуга в продукте — это название и цена, и больше
       ничего; ярлык с ценой говорит про неё ровно это.

       Раздел годами лежал вкладкой внутри настроек, хотя цену правят
       чаще всего остального в кабинете вместе взятого. Настройки — то,
       что трогают раз в год; прейскурант — рабочая сущность наравне с
       людьми и машинами, и место ему здесь. */
    icon: <Tags aria-hidden="true" />,
  },
  {
    href: '/owner/clients',
    label: t.owner.tabClients,
    // машина сбоку — клиент здесь это номер на кузове
    icon: <CarFront aria-hidden="true" />,
  },
  {
    href: '/owner/passes',
    label: t.passes.title,
    feature: 'passes',
    // талон
    icon: <TicketCheck aria-hidden="true" />,
  },
  {
    href: '/owner/staff',
    label: t.settings.staff,
    /* Двое, а не один: раздел о людях во множественном числе, а
       одиночная фигура уже занята «моей страницей» внизу колонки. Два
       одинаковых значка в одном столбце — это не значки, а орнамент. */
    icon: <Users aria-hidden="true" />,
  },
  {
    href: '/owner/settings',
    label: t.owner.tabSettings,
    // ползунки
    icon: <SlidersHorizontal aria-hidden="true" />,
  },
  ];
}

/** Разделы, доступные этому бизнесу. */
export function sectionsFor(passes: boolean, t: Dict): Section[] {
  return sections(t).filter((s) => !s.feature || passes);
}

/**
 * Какой раздел открыт сейчас.
 *
 * По самому длинному совпадению — иначе обзор победил бы всех: с
 * `/owner` начинается каждый адрес кабинета.
 *
 * И поэтому же обзор совпадает ТОЛЬКО точно. Он единственный раздел без
 * собственной ветки адресов, и правило «адрес начинается с этого» делало
 * его подсвеченным везде: на своей странице, на профиле, на филиалах.
 * У человека, открывшего профиль, в меню горел «Сегодня» — то есть меню
 * говорило, что он в другом месте, чем на самом деле.
 *
 * Страницы вне списка (профиль, филиалы) не подсвечивают ничего, и это
 * верно: их вход не в меню разделов, а внизу колонки и в настройках.
 */
export function currentSection(pathname: string, t: Dict): Section | undefined {
  return [...sections(t)]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) =>
      s.href === '/owner' ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`),
    );
}
