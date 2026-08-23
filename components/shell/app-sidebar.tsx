import Link from 'next/link';

import { Wordmark } from '@/components/wordmark';
import { AccountMenu } from '@/components/shell/account-menu';
import { PointSwitcher } from '@/components/shell/point-switcher';
import { SideNav } from '@/components/shell/side-nav';
import { getDict } from '@/lib/i18n/server';
import type { Point } from '@/lib/accounts';
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
 * Колонка кабинета: марка, бизнес (или переключатель филиалов),
 * разделы группами, внизу человек. Сворачивается до значков по ⌘B.
 */
export async function AppSidebar({
  tenantName,
  userName,
  points,
  currentTid,
  passes,
  active,
}: {
  tenantName: string;
  userName: string;
  points?: Point[];
  currentTid?: string;
  passes: boolean;
  active: 'owner' | 'work';
}) {
  const t = await getDict();
  const many = !!points && points.length > 1 && !!currentTid;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="gap-2 px-2 pt-3 pb-1">
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

        <SidebarMenu>
          <SidebarMenuItem>
            {many ? (
              <PointSwitcher points={points!} currentId={currentTid!} subtitle={userName} />
            ) : (
              <div
                className="mx-0 grid gap-0.5 rounded-md border border-sidebar-border bg-background px-2.5 py-2 group-data-[collapsible=icon]:hidden"
                aria-label={`${tenantName} · ${userName}`}
              >
                <span className="truncate text-[13px] leading-tight font-semibold">{tenantName}</span>
                <span className="truncate text-xs leading-tight text-muted-foreground">{userName}</span>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="px-1">
        <SideNav passes={passes} />
      </SidebarContent>

      <SidebarFooter className="gap-2 pb-3">
        <SidebarSeparator className="mx-1" />
        <AccountMenu userName={userName} active={active} />
      </SidebarFooter>
      <SidebarRail className="outline-none" />
    </Sidebar>
  );
}
