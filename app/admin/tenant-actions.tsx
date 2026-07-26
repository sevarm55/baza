'use client';

import { useTransition } from 'react';
import { blockTenant, extendSubscription, unblockTenant } from './actions';
import s from './admin.module.css';

/**
 * Кнопки управления бизнесом.
 *
 * Отключение спрашивает подтверждение и называет бизнес по имени:
 * нажатие не туда оставляет живую мойку без учёта посреди смены.
 */
export function TenantActions({
  tenantId,
  name,
  blocked,
}: {
  tenantId: string;
  name: string;
  blocked: boolean;
}) {
  const [pending, startTransition] = useTransition();

  const run = (fn: () => Promise<void>) => startTransition(async () => void (await fn()));

  return (
    <div className={s.actions}>
      {[1, 3, 12].map((months) => (
        <button
          key={months}
          className={s.btn}
          disabled={pending}
          onClick={() => run(() => extendSubscription(tenantId, months))}
        >
          +{months} мес
        </button>
      ))}

      <span className={s.spacer} />

      {blocked ? (
        <button
          className={`${s.btn} ${s.btnGood}`}
          disabled={pending}
          onClick={() => run(() => unblockTenant(tenantId))}
        >
          Включить
        </button>
      ) : (
        <button
          className={`${s.btn} ${s.btnDanger}`}
          disabled={pending}
          onClick={() => {
            if (!confirm(`Отключить «${name}»? Доступ закроется сразу, данные сохранятся.`)) {
              return;
            }
            run(() => blockTenant(tenantId));
          }}
        >
          Отключить
        </button>
      )}
    </div>
  );
}
