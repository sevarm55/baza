import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/shell/app-sidebar';
import { BillingBanner } from '@/components/shell/billing-banner';
import { TopBar } from '@/components/shell/top-bar';
import { MobileAppBar } from '@/components/mobile/app-bar';
import { MTabBar } from '@/components/mobile/chrome';
import { OfflineBar, PageFade } from '@/components/loading';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { Point } from '@/lib/accounts';
import type { Alert } from '@/lib/alerts';
import type { Access } from '@/lib/subscription';
import { cn } from '@/lib/utils';

/**
 * Оболочка кабинета владельца — две разные, в одном месте.
 *
 * На компьютере: колонка слева, полоса сверху, рабочая область с
 * ограниченной шириной. Обязанности разнесены — колонка отвечает «куда
 * пойти» и «кто я», полоса «на что смотрю» и «что сделать сейчас».
 *
 * На телефоне колонки нет вовсе. Не свёрнутая в гамбургер — её нет:
 * разделы живут в полосе вкладок внизу, у большого пальца, ровно как в
 * приложении. Гамбургер прячет навигацию за нажатие и за анимацию, и
 * человек, который сорок раз за смену ходит между сменой и сводкой,
 * платит за это шестьдесят лишних касаний.
 *
 * Обе оболочки — чрома вокруг ОДНОГО `main`: содержимое страницы
 * рисуется один раз, а его мобильное и десктопное представления решает
 * сама страница (`MobileOnly` / `DesktopOnly`).
 */
export function AppShell({
  tenantName,
  userName,
  roleLabel,
  points,
  currentTid,
  passes,
  alerts,
  access,
  sidebarOpen,
  quickAdd,
  narrow = false,
  children,
}: {
  tenantName: string;
  userName: string;
  /** «Владелец» или роль сотрудника словами бизнеса */
  roleLabel: string;
  points: Point[];
  currentTid: string;
  passes: boolean;
  alerts: Alert[];
  access: Access;
  sidebarOpen: boolean;
  quickAdd?: string | null;
  /** узкая рабочая область: экран смены, профиль */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      {/* Колонка не просто спрятана классом на себе: `display:contents`
          на обёртке убирает её из потока целиком, и на телефоне до
          гидратации не мелькает полоса в 240 точек. */}
      <div className="hidden md:contents">
        <AppSidebar userName={userName} roleLabel={roleLabel} passes={passes} />
      </div>

      <SidebarInset
        className="min-w-0 bg-background max-md:bg-m-bg"
        style={
          {
            '--m-bottom-inset':
              'calc(var(--m-tab-h) + var(--m-tab-gap) * 2 + var(--m-safe-bottom))',
          } as React.CSSProperties
        }
      >
        <div className="hidden md:contents">
          <TopBar
            alerts={alerts}
            tenantName={tenantName}
            points={points}
            currentTid={currentTid}
            canManage
            quickAdd={quickAdd}
          />
        </div>

        <MobileAppBar
          tenantName={tenantName}
          points={points}
          currentTid={currentTid}
          alerts={alerts}
          userName={userName}
          roleLabel={roleLabel}
          owner
        />

        {/* Поле страницы на телефоне живёт здесь, а не в каждой
            странице: оно уважает чёлку в повороте (`m-pad-x`) и
            отводит место под полосу вкладок в конце прокрутки. Забыть
            второе можно ровно один раз, и тогда последняя строка
            списка навсегда останется под вкладками. */}
        <main
          className={cn(
            'mx-auto w-full min-w-0 flex-1',
            'max-md:m-pad-x max-md:m-tabs-space max-md:pt-2',
            'md:px-6 md:py-6',
            narrow ? 'max-w-3xl' : 'max-w-(--page-max)',
          )}
        >
          <BillingBanner access={access} role="owner" />
          <PageFade>{children}</PageFade>
        </main>

        <OfflineBar />
      </SidebarInset>

      <MTabBar />
    </SidebarProvider>
  );
}
