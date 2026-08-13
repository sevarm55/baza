import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { hy } from '@/lib/i18n/hy';
import { Bell } from '@/components/bell';
import type { Alert } from '@/lib/alerts';
import { Logo } from '@/components/logo';
import { SideNav } from '@/components/side-nav';
import { PointSwitcher } from '@/components/point-switcher';
import { SidebarAccountMenu } from '@/components/sidebar-account-menu';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
} from '@/components/ui/sidebar';
import type { Point } from '@/lib/accounts';

/** Tetrin navigation composed on the official shadcn Sidebar primitive. */
export function Rail({
  tenantName,
  userName,
  points,
  currentTid,
  passes,
  active,
  alerts,
}: {
  tenantName: string;
  userName: string;
  points?: Point[];
  currentTid?: string;
  passes: boolean;
  active: 'owner' | 'work';
  alerts?: Alert[];
}) {
  const many = !!points && points.length > 1 && !!currentTid;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="relative gap-2 px-2 pt-3 pb-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link href="/owner" aria-label={hy.app.name} />}
              size="lg"
              tooltip={hy.app.name}
            >
              <Logo size={32} withName={false} className="shrink-0" />
              <span className="truncate font-bold tracking-[.18em]">
                {hy.app.name.toUpperCase()}
              </span>
            </SidebarMenuButton>
            <SidebarTrigger
              aria-label={hy.common.collapse}
              title={`${hy.common.collapse} · ⌘B`}
              className="absolute right-2.5 top-2.5 group-data-[collapsible=icon]:hidden"
            />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="mx-1 my-1" />

        <SidebarMenu>
          <SidebarMenuItem>
            {many ? (
              <PointSwitcher points={points!} currentId={currentTid!} subtitle={userName} sidebar />
            ) : (
              <SidebarMenuButton
                render={<div />}
                size="lg"
                tooltip={tenantName}
                aria-label={`${tenantName} · ${userName}`}
              >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
                  <Building2 className="size-4" aria-hidden="true" />
                </span>
                <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{tenantName}</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">{userName}</span>
                </span>
              </SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarSeparator className="mx-1 mt-1" />
      </SidebarHeader>

      <SidebarContent>
        <SideNav passes={passes} />
      </SidebarContent>

      <SidebarFooter className="gap-2 pb-3">
        {alerts && (
          <SidebarMenu>
            <SidebarMenuItem>
              <Bell alerts={alerts} sidebar />
            </SidebarMenuItem>
          </SidebarMenu>
        )}
        <SidebarSeparator className="mx-1" />
        <SidebarAccountMenu userName={userName} active={active} />
        <div className="hidden justify-center group-data-[collapsible=icon]:flex">
          <SidebarTrigger
            aria-label={hy.common.expand}
            title={`${hy.common.expand} · ⌘B`}
            className="size-10 rounded-md bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
          />
        </div>
      </SidebarFooter>
      <SidebarRail className="outline-none" />
    </Sidebar>
  );
}
