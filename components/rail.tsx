import Link from 'next/link';
import { Bell } from '@/components/bell';
import { Wordmark } from '@/components/wordmark';
import type { Alert } from '@/lib/alerts';
import { SideNav } from '@/components/side-nav';
import { PointSwitcher } from '@/components/point-switcher';
import { SidebarAccountMenu } from '@/components/sidebar-account-menu';
import { getDict } from '@/lib/i18n/server';
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
export async function Rail({
  tenantName,
  userName,
  points,
  currentTid,
  passes,
  active,
  alerts,
  hint,
}: {
  tenantName: string;
  userName: string;
  points?: Point[];
  currentTid?: string;
  passes: boolean;
  active: 'owner' | 'work';
  alerts?: Alert[];
  /** раздел со следующим шагом настройки; после неё — ничего */
  hint?: string | null;
}) {
  const t = await getDict();
  const many = !!points && points.length > 1 && !!currentTid;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="relative gap-2.5 px-2 pt-3.5 pb-1">
        <SidebarMenu>
          <SidebarMenuItem>
            {/* Марка — набранная, а не нарисованная.

                Квадратная иконка приложения рядом со словом «TETRIN»
                повторяла его же: два раза одно имя, и колонка начиналась
                с картинки, а не с продукта. Осталось слово — разрядка
                .18em, полужирный, тот же набор, что на витрине.

                В свёрнутой колонке от него остаётся одна буква: шестьдесят
                восемь точек не держат восемь знаков в разрядку, а
                обрезанное «TET…» читается поломкой, а не сокращением. */}
            <SidebarMenuButton
              render={<Link href="/owner" aria-label={t.app.name} />}
              size="lg"
              tooltip={t.app.name}
            >
              {/* Свёрнутая колонка: одна буква по центру, ровно над
                  столбиком значков. Буква — не значок, и правила
                  центровки, которые колонка применяет к svg, до неё не
                  доходят; поэтому ширина во всю строку и текст по
                  середине. */}
              <span
                aria-hidden
                className="wordmark hidden w-full shrink-0 text-center text-[17px] group-data-[collapsible=icon]:inline-block"
              >
                {t.app.name.charAt(0).toUpperCase()}
              </span>
              <Wordmark className="text-[14px] group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
            <SidebarTrigger
              aria-label={t.common.collapse}
              title={`${t.common.collapse} · ⌘B`}
              className="absolute right-2.5 top-2.5 group-data-[collapsible=icon]:hidden"
            />
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          <SidebarMenuItem>
            {many ? (
              <PointSwitcher points={points!} currentId={currentTid!} subtitle={userName} sidebar />
            ) : (
              /* Карточка бизнеса, а не строка меню.

                 Значок дома в квадрате стоял тут вместо ответа: он
                 сообщал «это бизнес», хотя это и так единственное имя
                 собственное в колонке. Осталось само имя и точка под
                 ним, на своей подложке с волосяной рамкой — так их видно
                 как один предмет, а не как ещё два пункта меню. */
              <div
                className="mx-1 grid gap-0.5 rounded-lg border border-sidebar-border bg-background px-2.5 py-2 group-data-[collapsible=icon]:hidden"
                aria-label={`${tenantName} · ${userName}`}
              >
                <span className="truncate text-[13px] font-semibold leading-tight">
                  {tenantName}
                </span>
                <span className="truncate text-[11.5px] leading-tight text-sidebar-foreground/55">
                  {userName}
                </span>
              </div>
            )}
          </SidebarMenuItem>
        </SidebarMenu>

      </SidebarHeader>

      <SidebarContent>
        <SideNav passes={passes} hint={hint} />
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
            aria-label={t.common.expand}
            title={`${t.common.expand} · ⌘B`}
            className="size-10 rounded-md bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
          />
        </div>
      </SidebarFooter>
      <SidebarRail className="outline-none" />
    </Sidebar>
  );
}
