'use client';

import { useTransition } from 'react';
import { revokeOrder } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Отмена — операция с деньгами, поэтому спрашиваем подтверждение.
 * Запись не удаляется: она останется в истории и в аудите.
 */
export function CancelOrderButton({ orderId }: { orderId: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="shrink-0 rounded-lg px-2 py-1 text-sm text-muted transition hover:bg-surface2 hover:text-bad disabled:opacity-40"
      title={hy.owner.cancelOrder}
      aria-label={hy.owner.cancelOrder}
      disabled={pending}
      onClick={() => {
        if (!confirm(hy.owner.confirmCancel)) return;
        startTransition(async () => void (await revokeOrder(orderId)));
      }}
    >
      {pending ? '…' : '✕'}
    </button>
  );
}
