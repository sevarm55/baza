'use client';

import Link from 'next/link';
import { useLocale, useSetLocale, useT } from '@/lib/i18n/client';
import { LOCALES, LOCALE_NAMES } from '@/lib/i18n';
import { setTheme, useTheme } from '@/components/use-theme';
import {
  Check,
  ChevronsUpDown,
  Languages,
  LayoutDashboard,
  LogOut,
  Moon,
  SlidersHorizontal,
  SprayCan,
  Sun,
  UserRound,
} from 'lucide-react';
import { signOut } from '@/app/actions';
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

/**
 * Меню пользователя внизу колонки.
 *
 * Это быстрый путь, а не вторая страница профиля. Всё, что здесь лежит,
 * имеет свой настоящий дом: личные данные и безопасность — в профиле,
 * настройки бизнеса — в настройках. Меню только сокращает дорогу до
 * двух самых частых пунктов и держит три вещи, которые меняют на бегу и
 * которые принадлежат человеку, а не бизнесу: экран мойщика, язык и
 * тема.
 *
 * Переключение роли остаётся именно здесь, потому что другого входа на
 * экран мойщика в кабинете нет вовсе: убрать его значило бы запереть
 * владельца в кабинете.
 */
export function SidebarAccountMenu({
  userName,
  active,
}: {
  userName: string;
  active: 'owner' | 'work';
}) {
  const t = useT();
  const locale = useLocale();
  const { setLocale } = useSetLocale();
  const { isMobile, setOpenMobile } = useSidebar();
  const theme = useTheme();
  const activeLabel = active === 'owner' ? t.roles.owner : t.roles.staff;

  const roles = [
    { href: '/work', key: 'work', label: t.roles.staff, icon: SprayCan },
    { href: '/owner', key: 'owner', label: t.roles.owner, icon: LayoutDashboard },
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
            {/* Подпись обязана стоять ВНУТРИ группы: в Base UI она часть
                группы, а не самостоятельный элемент меню, и снаружи
                бросает исключение при отрисовке — вместе с ним рвётся
                гидратация всей страницы, и не работает ни одна кнопка.

                Две страницы, до которых отсюда сокращают дорогу. Больше
                разделов здесь быть не должно: список разделов — в колонке
                над этим меню, и второй такой же внутри него означал бы
                два разных пути к одному месту. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel className="px-2 py-1.5">
                <span className="block truncate text-sm font-semibold text-popover-foreground">
                  {userName}
                </span>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  {activeLabel}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuItem
                render={<Link href="/owner/profile" onClick={() => setOpenMobile(false)} />}
                className="py-2"
              >
                <UserRound aria-hidden="true" />
                {t.profile.title}
              </DropdownMenuItem>
              <DropdownMenuItem
                render={<Link href="/owner/settings" onClick={() => setOpenMobile(false)} />}
                className="py-2"
              >
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
                    className="py-2"
                  >
                    <Icon aria-hidden="true" />
                    <span>{role.label}</span>
                    {selected && <Check className="ml-auto" aria-hidden="true" />}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuGroup>

            {/* Язык — здесь же, где тема: и то и другое человек меняет
                для себя, а не для бизнеса. Каждый язык подписан своим
                словом; флагов нет — флаг это страна, а не язык.

                Полный вид обеих настроек живёт в профиле, в разделе
                «интерфейс». Здесь короткий путь для того, кто уже знает,
                что ищет. */}
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              {LOCALES.map((code) => (
                <DropdownMenuItem
                  key={code}
                  nativeButton
                  render={
                    <button
                      type="button"
                      className="w-full py-2 text-start"
                      onClick={() => setLocale(code)}
                    />
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
                  className="w-full py-2 text-start"
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
                render={<button type="submit" className="w-full py-2 text-start" />}
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
