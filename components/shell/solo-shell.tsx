import type { ReactNode } from 'react';

import { BillingBanner } from '@/components/shell/billing-banner';
import { BranchLabel, BranchSwitcher } from '@/components/shell/branch-switcher';
import { BarUserMenu } from '@/components/shell/user-menu';
import { Wordmark } from '@/components/wordmark';
import { OfflineBar, PageFade } from '@/components/loading';
import { getDict } from '@/lib/i18n/server';
import type { Point } from '@/lib/accounts';
import type { Access } from '@/lib/subscription';

/**
 * Оболочка сотрудника: одна полоса сверху и узкая колонка под ней.
 *
 * Разделов у мойщика нет, поэтому нет и боковой колонки: в полосе
 * стоят марка, филиал (переключатель, если их несколько) и меню
 * аккаунта с языком, темой и выходом. Те же компоненты, что у владельца:
 * человек с двумя ролями на двух мойках видит одно и то же меню.
 */
export async function SoloShell({
  tenantName,
  userName,
  roleLabel,
  points,
  currentTid,
  access,
  shiftOpen,
  children,
}: {
  tenantName: string;
  userName: string;
  roleLabel: string;
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
      <header className="safe-top sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background px-3 md:px-4">
        <span className="flex shrink-0 items-center" aria-label={t.app.name} role="img">
          <Wordmark />
        </span>
        <span className="hidden h-4 w-px bg-border sm:block" aria-hidden />

        <div className="flex min-w-0 flex-1 items-center">
          {many ? (
            <BranchSwitcher points={points} currentId={currentTid} />
          ) : (
            <BranchLabel name={tenantName} />
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          <BarUserMenu userName={userName} roleLabel={roleLabel} owner={false} shiftOpen={shiftOpen} />
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
