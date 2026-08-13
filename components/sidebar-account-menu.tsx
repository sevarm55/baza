'use client';

import { useSyncExternalStore } from 'react';
import Link from 'next/link';
import {
  Check,
  ChevronsUpDown,
  LayoutDashboard,
  LogOut,
  Moon,
  SprayCan,
  Sun,
  UserRound,
} from 'lucide-react';
import { signOut } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

type Theme = 'light' | 'dark';
const THEME_EVENT = 'tetrin:theme-change';

function subscribeTheme(onStoreChange: () => void) {
  window.addEventListener(THEME_EVENT, onStoreChange);
  return () => window.removeEventListener(THEME_EVENT, onStoreChange);
}

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function readServerTheme(): Theme {
  return 'dark';
}

/** Standard shadcn NavUser pattern: identity, role, theme and exit in one menu. */
export function SidebarAccountMenu({
  userName,
  active,
}: {
  userName: string;
  active: 'owner' | 'work';
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const theme = useSyncExternalStore(subscribeTheme, readTheme, readServerTheme);
  const activeLabel = active === 'owner' ? hy.roles.owner : hy.roles.staff;

  function flipTheme() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('bazis.theme', next);
    } catch {
      // Private browsing can reject storage; the current session still changes.
    }
    window.dispatchEvent(new Event(THEME_EVENT));
  }

  const roles = [
    { href: '/work', key: 'work', label: hy.roles.staff, icon: SprayCan },
    { href: '/owner', key: 'owner', label: hy.roles.owner, icon: LayoutDashboard },
  ] as const;

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                tooltip={`${userName} · ${activeLabel}`}
                aria-label={`${userName} · ${activeLabel}`}
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-accent text-sidebar-accent-foreground">
              <UserRound className="size-4" aria-hidden="true" />
            </span>
            <span className="grid min-w-0 flex-1 text-left text-sm leading-tight">
              <span className="truncate font-semibold">{userName}</span>
              <span className="truncate text-xs text-sidebar-foreground/60">{activeLabel}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/55" aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? 'bottom' : 'right'}
            align="end"
            sideOffset={8}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5">
                <span className="block truncate text-sm font-semibold text-popover-foreground">{userName}</span>
                <span className="block truncate text-xs font-normal text-muted-foreground">{activeLabel}</span>
              </DropdownMenuLabel>
              <DropdownMenuItem
                render={<Link href="/owner/profile" onClick={() => setOpenMobile(false)} />}
                className="py-2"
              >
                <UserRound aria-hidden="true" />
                {hy.profile.title}
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {roles.map((role) => {
                const Icon = role.icon;
                const selected = active === role.key;
                return (
                  <DropdownMenuItem
                    key={role.key}
                    render={<Link href={role.href} onClick={() => setOpenMobile(false)} />}
                    className="py-2"
                  >
                    <Icon aria-hidden="true" />
                    <span>{role.label}</span>
                    {selected && <Check className="ml-auto" aria-hidden="true" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton
              render={<button type="button" className="w-full py-2 text-start" onClick={flipTheme} />}
            >
              {theme === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              {theme === 'light' ? 'Մուգ տեսք' : 'Լուսավոր տեսք'}
            </DropdownMenuItem>

            <form
              action={signOut}
              onSubmit={() => {
                navigator.serviceWorker?.controller?.postMessage('bazis:signout');
              }}
            >
              <DropdownMenuItem
                nativeButton
                variant="destructive"
                render={<button type="submit" className="w-full py-2 text-start" />}
              >
                <LogOut aria-hidden="true" />
                {hy.auth.signOut}
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
