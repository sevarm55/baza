import type { ReactNode } from 'react';

import { BillingBanner } from '@/components/shell/billing-banner';
import { PointSwitcher } from '@/components/shell/point-switcher';
import { LanguagePicker } from '@/components/language-picker';
import { SignOutButton } from '@/components/sign-out-button';
import { Wordmark } from '@/components/wordmark';
import { OfflineBar, PageFade } from '@/components/loading';
import { SidebarProvider } from '@/components/ui/sidebar';
import { getDict } from '@/lib/i18n/server';
import type { Point } from '@/lib/accounts';
import type { Access } from '@/lib/subscription';

/**
 * Оболочка сотрудника: одна полоса сверху и узкая колонка под ней.
 *
 * Разделов у мойщика нет, поэтому нет и боковой колонки: в полосе
 * стоят марка, бизнес с именем (или переключатель филиалов), язык и
 * выход. Всё остальное — содержимое экрана смены.
 */
export async function SoloShell({
  tenantName,
  userName,
  points,
  currentTid,
  access,
  shiftOpen,
  children,
}: {
  tenantName: string;
  userName: string;
  points: Point[];
  currentTid: string;
  access: Access;
  /** смена открыта: выход переспрашивает */
  shiftOpen: boolean;
  children: ReactNode;
}) {
  const t = await getDict();
  const many = points.length > 1;

  return (
    <div className="flex min-h-svh w-full flex-col bg-background">
      <header className="safe-top sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-border bg-background px-3 md:px-4">
        <span className="flex shrink-0 items-center" aria-label={t.app.name} role="img">
          <Wordmark />
        </span>

        <div className="flex min-w-0 flex-1 items-center">
          {many ? (
            /* Переключатель филиалов написан для колонки кабинета и
               читает её контекст даже в полосе; здесь контекст пустой,
               а обёртка без собственной коробки (`contents`) ничего не
               рисует. */
            <SidebarProvider className="contents">
              <PointSwitcher points={points} currentId={currentTid} subtitle={userName} variant="bar" />
            </SidebarProvider>
          ) : (
            <div className="grid min-w-0 leading-tight" aria-label={`${tenantName} · ${userName}`}>
              <span className="truncate text-sm font-semibold">{tenantName}</span>
              <span className="truncate text-xs text-muted-foreground">{userName}</span>
            </div>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <LanguagePicker compact />
          <SignOutButton shiftOpen={shiftOpen} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-5 md:px-6">
        <BillingBanner access={access} role="staff" />
        <PageFade>{children}</PageFade>
      </main>

      {/* Мойка часто в подвале или за городом. Без этой полосы пропавший
          интернет выглядел как сломанное приложение: запись ложилась в
          очередь, а почему — знал только тот, кто читал журнал. */}
      <OfflineBar />
    </div>
  );
}
