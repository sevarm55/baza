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
  const overview = sections.filter((section) => section.href === '/owner');
  const finance = sections.filter((section) =>
    ['/owner/payroll', '/owner/expenses'].includes(section.href),
  );
  const management = sections.filter(
    (section) => !overview.includes(section) && !finance.includes(section),
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
    </>
  );
}
