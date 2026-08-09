'use client';

import { signOut } from '@/app/actions';
import { IconPower } from '@/components/icons';
import { hy } from '@/lib/i18n/hy';

/**
 * При выходе просим service worker выбросить кэш страниц.
 * На мойке один телефон часто ходит по рукам, и следующий сотрудник
 * не должен увидеть офлайн чужую смену.
 */
export function SignOutButton() {
  return (
    <form
      action={signOut}
      onSubmit={() => {
        navigator.serviceWorker?.controller?.postMessage('bazis:signout');
      }}
    >
      <button className="btn-icon btn-icon-board" title={hy.auth.signOut} aria-label={hy.auth.signOut}>
        <IconPower className="size-4" />
      </button>
    </form>
  );
}
