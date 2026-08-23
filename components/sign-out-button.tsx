'use client';

import { LogOut } from 'lucide-react';
import { useState, useTransition } from 'react';

import { signOut } from '@/app/actions';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';

function dropCache() {
  navigator.serviceWorker?.controller?.postMessage('bazis:signout');
}

/**
 * Выход из аккаунта.
 *
 * С открытой сменой выход не запрещён, но переспрашивается: смена живёт
 * на сервере и закроется вечером сама, а человек, вышедший из
 * приложения, считает, что ушёл с работы.
 */
export function SignOutButton({
  shiftOpen,
  labelled,
  variant = 'ghost',
}: {
  shiftOpen?: boolean;
  labelled?: boolean;
  variant?: 'ghost' | 'outline' | 'destructive-soft';
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!shiftOpen) {
    return (
      <form action={signOut} onSubmit={dropCache}>
        <Button
          type="submit"
          variant={variant}
          size={labelled ? 'default' : 'icon-sm'}
          title={labelled ? undefined : t.auth.signOut}
          aria-label={labelled ? undefined : t.auth.signOut}
        >
          <LogOut data-icon={labelled ? 'inline-start' : undefined} />
          {labelled && t.auth.signOut}
        </Button>
      </form>
    );
  }

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={labelled ? 'default' : 'icon-sm'}
        title={labelled ? undefined : t.auth.signOut}
        aria-label={labelled ? undefined : t.auth.signOut}
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        <LogOut data-icon={labelled ? 'inline-start' : undefined} />
        {labelled && t.auth.signOut}
      </Button>

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
    </>
  );
}
