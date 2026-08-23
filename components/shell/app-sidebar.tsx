import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';
import { SidebarUserMenu } from '@/components/shell/user-menu';
import { SideNav } from '@/components/shell/side-nav';
import { getDict } from '@/lib/i18n/server';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from '@/components/ui/sidebar';

/**
 * Колонка кабинета: марка, разделы группами, внизу человек.
 *
 * Филиала здесь больше нет: это контекст данных, и он стоит в шапке
 * рядом с названием страницы. Колонка отвечает только на «куда пойти»
 * и «кто я», поэтому в ней две вещи, а не три. Сворачивается до значков
 * по ⌘B.
 */
export async function AppSidebar({
  userName,
  roleLabel,
  passes,
}: {
  userName: string;
  roleLabel: string;
  passes: boolean;
}) {
  const t = await getDict();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-2 pt-3 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            <Link
              href="/owner"
              aria-label={t.app.name}
              className="flex h-8 items-center rounded-md px-2 outline-none focus-visible:ring-2 focus-visible:ring-ring/50 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
            >
              <span
                aria-hidden
                className="hidden font-wordmark text-sm text-primary group-data-[collapsible=icon]:inline"
              >
                {t.app.name.charAt(0).toUpperCase()}
              </span>
              <Wordmark className="group-data-[collapsible=icon]:hidden" />
            </Link>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1 pt-1">
        <SideNav passes={passes} />
      </SidebarContent>

      <SidebarFooter className="gap-2 pb-3">
        <SidebarSeparator className="mx-1" />
        <SidebarUserMenu userName={userName} roleLabel={roleLabel} owner />
      </SidebarFooter>
      <SidebarRail className="outline-none" />
    </Sidebar>
  );
}
