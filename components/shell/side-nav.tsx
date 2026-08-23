'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { currentSection, sectionGroupsFor } from '@/components/sections';
import { usePendingTab } from '@/components/use-pending-tab';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

/**
 * Разделы в колонке, группами: обзор, работа, деньги, система.
 *
 * «Вы находитесь здесь» считает `currentSection`, там же, где
 * заголовок страницы; подсветка переезжает на нажатый раздел сразу,
 * не дожидаясь сервера. Одна точка подсказки у раздела со следующим
 * шагом настройки, и только пока настройка не закончена.
 */
export function SideNav({ passes, hint }: { passes: boolean; hint?: string | null }) {
  const t = useT();
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const current = currentSection(pathname, t)?.href ?? '';
  const { active, pending, select } = usePendingTab(current);

  return (
    <>
      {sectionGroupsFor(passes, t).map((group) => (
        <SidebarGroup key={group.key} className="py-1">
          {group.label && (
            <SidebarGroupLabel className="h-7 px-2 text-2xs font-medium tracking-wider text-muted-foreground/80">
              {group.label}
            </SidebarGroupLabel>
          )}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((section) => {
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
                      className={cn(
                        'h-8 gap-2.5 px-2 text-[13px] font-medium text-sidebar-foreground',
                        '[&>svg]:size-4 [&>svg]:text-muted-foreground',
                        'data-active:bg-primary-soft data-active:text-primary-soft-foreground data-active:hover:bg-primary-soft data-active:[&>svg]:text-primary',
                      )}
                    >
                      {section.icon}
                      <span>{section.label}</span>
                      {hint === section.href && (
                        <span
                          className="ml-auto size-1.5 shrink-0 rounded-full bg-lime-ink"
                          title={t.setup.hintAria}
                        >
                          <span className="sr-only">{t.setup.hintAria}</span>
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}
