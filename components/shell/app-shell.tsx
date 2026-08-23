import type { ReactNode } from 'react';

import { AppSidebar } from '@/components/shell/app-sidebar';
import { BillingBanner } from '@/components/shell/billing-banner';
import { TopBar } from '@/components/shell/top-bar';
import { OfflineBar, PageFade } from '@/components/loading';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import type { Point } from '@/lib/accounts';
import type { Alert } from '@/lib/alerts';
import type { Access } from '@/lib/subscription';
import { cn } from '@/lib/utils';

/**
 * Оболочка кабинета владельца: колонка слева, полоса сверху, рабочая
 * область с ограниченной шириной. Одна на все разделы и на экран
 * смены владельца.
 *
 * Обязанности разнесены: колонка отвечает «куда пойти» и «кто я»,
 * полоса «на что смотрю» (филиал и страница) и «что сделать сейчас».
 */
export function AppShell({
  tenantName,
  userName,
  roleLabel,
  points,
  currentTid,
  passes,
  alerts,
  hint,
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
  hint?: string | null;
  access: Access;
  sidebarOpen: boolean;
  quickAdd?: string | null;
  /** узкая рабочая область: экран смены, профиль */
  narrow?: boolean;
  children: ReactNode;
}) {
  return (
    <SidebarProvider defaultOpen={sidebarOpen}>
      <AppSidebar userName={userName} roleLabel={roleLabel} passes={passes} hint={hint} />
      <SidebarInset className="min-w-0 bg-background">
        <TopBar
          alerts={alerts}
          tenantName={tenantName}
          points={points}
          currentTid={currentTid}
          canManage
          quickAdd={quickAdd}
        />
        <main className={cn('mx-auto w-full flex-1 px-4 py-5 md:px-6 md:py-6', narrow ? 'max-w-3xl' : 'max-w-(--page-max)')}>
          <BillingBanner access={access} role="owner" />
          <PageFade>{children}</PageFade>
        </main>
        <OfflineBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
