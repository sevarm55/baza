'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingTab } from '@/components/use-pending-tab';
import { sectionsFor } from '@/components/sections';
import { useT } from '@/lib/i18n/client';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  useSidebar,
} from '@/components/ui/sidebar';

/** Primary app navigation composed entirely from shadcn Sidebar parts. */
export function SideNav({ passes }: { passes: boolean }) {
  const t = useT();
  const pathname = usePathname();
  const sections = sectionsFor(passes, t);
  const { setOpenMobile } = useSidebar();

  const current =
    [...sections]
      .sort((a, b) => b.href.length - a.href.length)
      .find((section) => pathname === section.href || pathname.startsWith(`${section.href}/`))
      ?.href ?? '';

  const { active, pending, select } = usePendingTab(current);

  /* Четыре группы вместо трёх, и распределение задано списком адресов,
     а не «всё остальное».

     Раньше последняя группа собиралась вычитанием: что не обзор и не
     деньги — то управление. Из-за этого настройки стояли в одном
     столбце с людьми и клиентами, хотя они не рабочая сущность, а
     обслуживание продукта; и любой новый раздел молча падал туда же.

     Теперь принадлежность объявлена, а не выведена: раздел, забытый в
     этом списке, окажется в «управлении» осознанно — там же, где живут
     остальные сущности бизнеса. */
  const FINANCE = ['/owner/payroll', '/owner/expenses', '/owner/reports'];
  const SYSTEM = ['/owner/settings'];

  const overview = sections.filter((section) => section.href === '/owner');
  const finance = FINANCE.map((href) => sections.find((s) => s.href === href)).filter(
    (s) => s !== undefined,
  );
  const system = SYSTEM.map((href) => sections.find((s) => s.href === href)).filter(
    (s) => s !== undefined,
  );
  const management = sections.filter(
    (section) =>
      section.href !== '/owner' &&
      !FINANCE.includes(section.href) &&
      !SYSTEM.includes(section.href),
  );

  function renderSection(section: (typeof sections)[number]) {
    const selected = active === section.href;
    return (
      <SidebarMenuItem key={section.href}>
        <SidebarMenuButton
          render={
            <Link
              href={section.href}
              onClick={() => {
                select(section.href);
                setOpenMobile(false);
              }}
              aria-current={selected ? 'page' : undefined}
              data-pending={pending && selected ? '' : undefined}
            />
          }
          isActive={selected}
          tooltip={section.label}
          className="h-10 rounded-lg px-4 data-active:bg-good-bg data-active:text-good-ink data-active:hover:bg-good-bg data-active:hover:text-good-ink"
        >
          {section.icon}
          <span>{section.label}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <>
      <SidebarGroup className="py-2">
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{overview.map(renderSection)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator className="mx-4" />

      <SidebarGroup className="py-2">
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-[.12em]">
          {t.nav.finance}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{finance.map(renderSection)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator className="mx-4" />

      <SidebarGroup className="py-2">
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-[.12em]">
          {t.nav.management}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{management.map(renderSection)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarSeparator className="mx-4" />

      <SidebarGroup className="py-2">
        <SidebarGroupLabel className="text-[10px] font-semibold tracking-[.12em]">
          {t.nav.system}
        </SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu className="gap-1">{system.map(renderSection)}</SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </>
  );
}
