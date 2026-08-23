import type { ReactNode } from 'react';
import type { Dict } from '@/lib/i18n';
import {
  Banknote,
  CalendarDays,
  CarFront,
  ChartNoAxesCombined,
  ClipboardList,
  FileChartColumn,
  ReceiptText,
  SlidersHorizontal,
  Tags,
  TicketCheck,
  Users,
} from 'lucide-react';

/**
 * Разделы кабинета: один список на колонку, хлебные крошки и заголовки.
 *
 * Порядок и группы объявлены здесь, а не выведены: раздел, забытый в
 * этом списке, окажется в «управлении» осознанно. Значок у каждого
 * свой, одного рисунка (Lucide, 16, линия 1.5).
 */
export type Section = {
  href: string;
  label: string;
  icon: ReactNode;
  /** раздел живёт только при включённых абонементах */
  feature?: 'passes';
};

export type SectionGroup = {
  key: 'overview' | 'operations' | 'finance' | 'system';
  /** подпись группы в колонке; пусто у первой */
  label: string | null;
  items: Section[];
};

/** Группы разделов на языке того, кто смотрит. */
export function sectionGroups(t: Dict): SectionGroup[] {
  return [
    {
      key: 'overview',
      label: null,
      items: [
        { href: '/owner', label: t.owner.tabToday, icon: <ChartNoAxesCombined aria-hidden="true" /> },
        { href: '/owner/calendar', label: t.calendar.title, icon: <CalendarDays aria-hidden="true" /> },
      ],
    },
    {
      key: 'operations',
      label: t.nav.operations,
      items: [
        { href: '/work', label: t.phone.tabShift, icon: <ClipboardList aria-hidden="true" /> },
        { href: '/owner/clients', label: t.owner.tabClients, icon: <CarFront aria-hidden="true" /> },
        { href: '/owner/services', label: t.settings.tabServices, icon: <Tags aria-hidden="true" /> },
        { href: '/owner/staff', label: t.settings.staff, icon: <Users aria-hidden="true" /> },
        {
          href: '/owner/passes',
          label: t.passes.title,
          icon: <TicketCheck aria-hidden="true" />,
          feature: 'passes',
        },
      ],
    },
    {
      key: 'finance',
      label: t.nav.finance,
      items: [
        { href: '/owner/payroll', label: t.owner.tabPayroll, icon: <Banknote aria-hidden="true" /> },
        { href: '/owner/expenses', label: t.expenses.title, icon: <ReceiptText aria-hidden="true" /> },
        { href: '/owner/reports', label: t.reports.title, icon: <FileChartColumn aria-hidden="true" /> },
      ],
    },
    {
      key: 'system',
      label: null,
      items: [
        { href: '/owner/settings', label: t.owner.tabSettings, icon: <SlidersHorizontal aria-hidden="true" /> },
      ],
    },
  ];
}

/** Плоский список разделов. */
export function sections(t: Dict): Section[] {
  return sectionGroups(t).flatMap((g) => g.items);
}

/** Разделы, доступные этому бизнесу. */
export function sectionsFor(passes: boolean, t: Dict): Section[] {
  return sections(t).filter((s) => !s.feature || passes);
}

/** Группы с учётом доступных разделов. */
export function sectionGroupsFor(passes: boolean, t: Dict): SectionGroup[] {
  return sectionGroups(t)
    .map((g) => ({ ...g, items: g.items.filter((s) => !s.feature || passes) }))
    .filter((g) => g.items.length > 0);
}

/**
 * Какой раздел открыт сейчас: по самому длинному совпадению. Обзор
 * совпадает только точно, иначе он побеждал бы на каждом адресе
 * кабинета.
 */
export function currentSection(pathname: string, t: Dict): Section | undefined {
  return [...sections(t)]
    .sort((a, b) => b.href.length - a.href.length)
    .find((s) =>
      s.href === '/owner' ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`),
    );
}

/** Название страницы для крошек там, где раздела в списке нет. */
export function pageTitle(pathname: string, t: Dict): string | null {
  const section = currentSection(pathname, t);
  if (section) return section.label;
  if (pathname.startsWith('/owner/activity')) return t.activity.all;
  if (pathname.startsWith('/owner/profile')) return t.profile.title;
  if (pathname.startsWith('/owner/points')) return t.points.title;
  if (pathname.startsWith('/owner/day/')) return t.calendar.title;
  if (pathname.startsWith('/owner/more')) return t.phone.moreTitle;
  return null;
}
