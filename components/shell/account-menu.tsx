'use client';

import Link from 'next/link';
import {
  Check,
  ChevronsUpDown,
  ClipboardList,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  SlidersHorizontal,
  Sun,
  UserRound,
} from 'lucide-react';

import { signOut } from '@/app/actions';
import { PersonAvatar } from '@/components/patterns/person';
import { setTheme, useTheme } from '@/components/use-theme';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';

/**
 * Меню пользователя внизу колонки: короткий путь к профилю и
 * настройкам, переход между кабинетом и экраном смены, язык и тема.
 * Всё, что здесь лежит, имеет свой настоящий дом; меню только
 * сокращает дорогу.
 */
export function AccountMenu({ userName, active }: { userName: string; active: 'owner' | 'work' }) {
  const t = useT();
  const locale = useLocale();
  const { setLocale } = useSetLocale();
  const { isMobile, setOpenMobile } = useSidebar();
  const theme = useTheme();
  const activeLabel = active === 'owner' ? t.roles.owner : t.roles.staff;

  const roles = [
    { href: '/owner', key: 'owner', label: t.owner.tabToday, icon: LayoutDashboard },
    { href: '/work', key: 'work', label: t.phone.tabShift, icon: ClipboardList },
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
                className="data-open:bg-sidebar-accent"
              />
            }
          >
            <PersonAvatar name={userName} size="lg" className="size-8 rounded-md text-xs" />
            <span className="grid min-w-0 flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold">{userName}</span>
              <span className="truncate text-xs text-muted-foreground">{activeLabel}</span>
            </span>
            <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={8}
            className="min-w-60"
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5">
                <span className="block truncate text-sm font-semibold text-popover-foreground">
                  {userName}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {activeLabel}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuItem render={<Link href="/owner/profile" onClick={() => setOpenMobile(false)} />}>
                <UserRound aria-hidden="true" />
                {t.profile.title}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/owner/settings" onClick={() => setOpenMobile(false)} />}>
                <SlidersHorizontal aria-hidden="true" />
                {t.owner.tabSettings}
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
                  >
                    <Icon aria-hidden="true" />
                    <span>{role.label}</span>
                    {selected && <Check className="ml-auto" aria-hidden="true" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {LOCALES.map((code) => (
                <DropdownMenuItem
                  key={code}
                  nativeButton
                  render={
                    <button type="button" className="w-full text-start" onClick={() => setLocale(code)} />
                  }
                >
                  <Languages aria-hidden="true" />
                  {LOCALE_NAMES[code]}
                  {code === locale && <Check className="ml-auto" aria-hidden="true" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>

            <DropdownMenuSeparator />
            <DropdownMenuItem
              nativeButton
              render={
                <button
                  type="button"
                  className="w-full text-start"
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                />
              }
            >
              {theme === 'light' ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}
              {theme === 'light' ? t.common.themeDarkLong : t.common.themeLightLong}
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
                render={<button type="submit" className="w-full text-start" />}
              >
                <LogOut aria-hidden="true" />
                {t.auth.signOut}
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
