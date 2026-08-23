'use client';

import { useState } from 'react';

import { blockAccountAction, logoutAccountAction, resetAccessAction, unblockAccountAction } from '@/app/admin/actions';
import { ReasonDialog } from '@/components/admin/reason-dialog';
import { Button } from '@/components/ui/button';
import { useA } from '@/lib/i18n/admin/client';

type Kind = 'block' | 'unblock' | 'logout' | 'reset';

/**
 * Опасные действия над человеком: блокировка, выход везде, сброс
 * доступа. Каждое переспрашивает, требует причину и пишет в журнал.
 * Наблюдателю кнопки не показываются; себя трогать нельзя.
 */
export function AccountActions({
  accountId,
  phone,
  blocked,
  hasSessions,
  canAct,
}: {
  accountId: string;
  phone: string;
  blocked: boolean;
  hasSessions: boolean;
  canAct: boolean;
}) {
  const a = useA();
  const [kind, setKind] = useState<Kind | null>(null);
  if (!canAct) return null;

  const spec: Record<Kind, { title: string; note: string; confirm: string; done: string; destructive: boolean; run: (r: string) => ReturnType<typeof blockAccountAction> }> = {
    block: { title: a.users.blockTitle(phone), note: a.users.blockNote, confirm: a.users.block, done: a.users.blocked, destructive: true, run: (reason) => blockAccountAction({ accountId, reason }) },
    unblock: { title: a.users.unblockTitle(phone), note: '', confirm: a.users.unblock, done: a.users.unblocked, destructive: false, run: (reason) => unblockAccountAction({ accountId, reason }) },
    logout: { title: a.users.logoutAllTitle(phone), note: a.users.logoutAllNote, confirm: a.users.logoutAll, done: a.users.loggedOut, destructive: true, run: (reason) => logoutAccountAction({ accountId, reason }) },
    reset: { title: a.users.resetAccessTitle(phone), note: a.users.resetAccessNote, confirm: a.users.resetAccess, done: a.users.resetDone, destructive: true, run: (reason) => resetAccessAction({ accountId, reason }) },
  };

  return (
    <div className="flex flex-wrap gap-2">
      {blocked ? (
        <Button size="sm" variant="outline" onClick={() => setKind('unblock')}>
          {a.users.unblock}
        </Button>
      ) : (
        <Button size="sm" variant="destructive-soft" onClick={() => setKind('block')}>
          {a.users.block}
        </Button>
      )}
      <Button size="sm" variant="outline" onClick={() => setKind('logout')} disabled={!hasSessions}>
        {a.users.logoutAll}
      </Button>
      <Button size="sm" variant="outline" onClick={() => setKind('reset')}>
        {a.users.resetAccess}
      </Button>

      {kind && (
        <ReasonDialog
          open
          onOpenChange={(o) => !o && setKind(null)}
          title={spec[kind].title}
          description={spec[kind].note || undefined}
          confirmLabel={spec[kind].confirm}
          destructive={spec[kind].destructive}
          action={spec[kind].run}
          successMessage={spec[kind].done}
        />
      )}
    </div>
  );
}
