'use client';

import Link from 'next/link';
import { ChevronsUpDown, Languages, LogOut, Moon, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useState, useTransition, type ReactElement } from 'react';

import { signOut } from '@/app/actions';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { PersonAvatar } from '@/components/patterns/person';
import { setTheme, useTheme } from '@/components/use-theme';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { LOCALES, LOCALE_NAMES, type Locale } from '@/lib/i18n';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';

function dropCache() {
  navigator.serviceWorker?.controller?.postMessage('bazis:signout');
}

/**
 * Меню аккаунта: только то, что относится к человеку, а не к бизнесу.
 *
 * Профиль, настройки бизнеса (владельцу), язык и тема подменю, выход.
 * Разделов продукта здесь нет: они стоят в колонке, и второй список тех
 * же ссылок только путал бы, какой из них главный. Язык и тема свёрнуты
 * в подменю, чтобы меню читалось пятью строками, а не десятью.
 *
 * Одна реализация на оба экрана: в колонке владельца триггер это строка
 * с аватаром и именем, в полосе мойщика один аватар. Содержимое общее.
 */
export function UserMenu({
  userName,
  roleLabel,
  owner,
  shiftOpen = false,
  side = 'right',
  align = 'end',
  onNavigate,
  trigger,
}: {
  userName: string;
  roleLabel: string;
  /** владелец видит настройки бизнеса */
  owner: boolean;
  /** смена открыта: выход переспрашивает */
  shiftOpen?: boolean;
  side?: 'right' | 'top' | 'bottom';
  align?: 'start' | 'end';
  /** закрыть мобильную колонку после перехода */
  onNavigate?: () => void;
  trigger: ReactElement;
}) {
  const t = useT();
  const locale = useLocale();
  const { setLocale } = useSetLocale();
  const theme = useTheme();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={trigger} />

        <DropdownMenuContent side={side} align={align} sideOffset={8} className="min-w-56">
          <DropdownMenuGroup>
            <DropdownMenuLabel className="px-2 py-1.5">
              <span className="block truncate text-sm font-semibold text-popover-foreground">{userName}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{roleLabel}</span>
            </DropdownMenuLabel>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem render={<Link href="/owner/profile" onClick={onNavigate} />}>
              <UserRound aria-hidden="true" />
              {t.profile.title}
            </DropdownMenuItem>
            {owner && (
              <DropdownMenuItem render={<Link href="/owner/settings" onClick={onNavigate} />}>
                <SlidersHorizontal aria-hidden="true" />
                {t.owner.tabSettings}
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Languages aria-hidden="true" />
                <span className="flex-1">{t.common.language}</span>
                <span className="text-xs text-muted-foreground">{LOCALE_NAMES[locale]}</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                <DropdownMenuRadioGroup value={locale} onValueChange={(v) => setLocale(v as Locale)}>
                  {LOCALES.map((code) => (
                    <DropdownMenuRadioItem key={code} value={code}>
                      {LOCALE_NAMES[code]}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>

            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {theme === 'light' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                <span className="flex-1">{t.common.theme}</span>
                <span className="text-xs text-muted-foreground">
                  {theme === 'light' ? t.common.themeLight : t.common.themeDark}
                </span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="min-w-40">
                <DropdownMenuRadioGroup
                  value={theme}
                  onValueChange={(v) => setTheme(v === 'dark' ? 'dark' : 'light')}
                >
                  <DropdownMenuRadioItem value="light">{t.common.themeLightLong}</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="dark">{t.common.themeDarkLong}</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />
          {shiftOpen ? (
            <DropdownMenuItem
              nativeButton
              variant="destructive"
              render={<button type="button" className="w-full text-start" onClick={() => setAsking(true)} />}
            >
              <LogOut aria-hidden="true" />
              {t.auth.signOut}
            </DropdownMenuItem>
          ) : (
            <form action={signOut} onSubmit={dropCache}>
              <DropdownMenuItem
                nativeButton
                variant="destructive"
                render={<button type="submit" className="w-full text-start" />}
              >
                <LogOut aria-hidden="true" />
                {t.auth.signOut}
              </DropdownMenuItem>
            </form>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {shiftOpen && (
        <ConfirmDialog
          open={asking}
          onOpenChange={(next) => !pending && setAsking(next)}
          title={t.work.signOutOpenTitle}
          description={t.work.signOutOpenNote}
          cancelLabel={t.work.endStay}
          confirmLabel={t.auth.signOut}
          busyLabel={t.auth.signingOut}
          busy={pending}
          onConfirm={() =>
            startTransition(async () => {
              dropCache();
              await signOut();
            })
          }
        />
      )}
    </>
  );
}

/** Меню аккаунта внизу колонки кабинета. */
export function SidebarUserMenu({
  userName,
  roleLabel,
  owner,
}: {
  userName: string;
  roleLabel: string;
  owner: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <UserMenu
          userName={userName}
          roleLabel={roleLabel}
          owner={owner}
          side={isMobile ? 'top' : 'right'}
          onNavigate={() => setOpenMobile(false)}
          trigger={
            <SidebarMenuButton
              size="lg"
              tooltip={`${userName} · ${roleLabel}`}
              aria-label={`${userName} · ${roleLabel}`}
              className="data-open:bg-sidebar-accent"
            >
              <PersonAvatar name={userName} size="lg" className="size-8 rounded-md text-xs" />
              <span className="grid min-w-0 flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold">{userName}</span>
                <span className="truncate text-xs text-muted-foreground">{roleLabel}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
            </SidebarMenuButton>
          }
        />
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/** Меню аккаунта одним аватаром: для полосы без колонки. */
export function BarUserMenu({
  userName,
  roleLabel,
  owner,
  shiftOpen,
}: {
  userName: string;
  roleLabel: string;
  owner: boolean;
  shiftOpen?: boolean;
}) {
  return (
    <UserMenu
      userName={userName}
      roleLabel={roleLabel}
      owner={owner}
      shiftOpen={shiftOpen}
      side="bottom"
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={`${userName} · ${roleLabel}`}
          className="data-open:bg-accent"
        >
          <PersonAvatar name={userName} size="sm" className="size-6" />
        </Button>
      }
    />
  );
}
