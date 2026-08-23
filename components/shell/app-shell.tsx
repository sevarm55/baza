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
 */
export function AppShell({
  tenantName,
  userName,
  points,
  currentTid,
  passes,
  active,
  alerts,
  access,
  sidebarOpen,
  quickAdd,
  narrow = false,
  children,
}: {
  tenantName: string;
  userName: string;
  points: Point[];
  currentTid: string;
  passes: boolean;
  active: 'owner' | 'work';
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
      <AppSidebar
        tenantName={tenantName}
        userName={userName}
        points={points}
        currentTid={currentTid}
        passes={passes}
        active={active}
      />
      <SidebarInset className="min-w-0 bg-background">
        <TopBar alerts={alerts} tenantName={tenantName} quickAdd={quickAdd} />
        <main className={cn('mx-auto w-full flex-1 px-4 py-5 md:px-6 md:py-6', narrow ? 'max-w-3xl' : 'max-w-(--page-max)')}>
          <BillingBanner access={access} role="owner" />
          <PageFade>{children}</PageFade>
        </main>
        <OfflineBar />
      </SidebarInset>
    </SidebarProvider>
  );
}
