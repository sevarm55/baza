'use client';

import { signOut } from '@/app/actions';
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
      <button className="btn-icon" title={hy.auth.signOut} aria-label={hy.auth.signOut}>
        ⏻
      </button>
    </form>
  );
}
