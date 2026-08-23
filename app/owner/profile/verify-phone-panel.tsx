'use client';

import { useActionState } from 'react';

import { verifyOwnPhoneAction, type VerifyPhoneState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { useT } from '@/lib/i18n/client';

/**
 * Подтверждение своего номера для тех, кто регистрировался до кода из
 * SMS.
 *
 * Предложение, а не требование: ни баннера на весь экран, ни
 * блокировки. Блок предупреждения в «безопасности», одна строка
 * объяснения и кнопка. Объяснение честное: без подтверждённого номера
 * PIN не восстановить, и это единственное, что человек теряет.
 */
export function VerifyPhonePanel({
  phone,
}: {
  /** уже в маскированном виде: на экран, а не в запрос */
  phone: string;
}) {
  const [state, action, pending] = useActionState<VerifyPhoneState, FormData>(
    verifyOwnPhoneAction,
    null,
  );
  const t = useT();

  if (state?.step === 'done') {
    return <FormMessage tone="success">{t.auth.verified}</FormMessage>;
  }

  return (
    <div className="rounded-md border border-warning/30 bg-warning-soft p-3">
      <p className="text-sm font-semibold text-warning-soft-foreground">{t.auth.verifyPhone}</p>

      {state?.step === 'code' ? (
        <form action={action} className="mt-2 flex flex-col gap-3">
          <input type="hidden" name="challengeId" value={state.challengeId} />
          <p className="text-sm text-muted-foreground">{t.auth.otpSent(phone)}</p>

          <CodeInput
            name="code"
            length={CODE_LENGTH}
            label={t.auth.otpGroup(CODE_LENGTH)}
            title={t.auth.otpCode}
            autoComplete="one-time-code"
            autoFocus
            submitOnComplete
            enteredLabel={t.auth.entered}
            invalid={Boolean(state.error)}
          />

          {state.error && <FormMessage>{state.error}</FormMessage>}

          <div>
            <LoadingButton
              size="sm"
              busy={pending}
              label={t.auth.otpVerify}
              busyLabel={t.auth.checking}
            />
          </div>
        </form>
      ) : (
        /* Кнопка по содержимому, а не во всю ширину: действие здесь
           предложение, а не главное дело страницы. */
        <form action={action} className="mt-1 flex flex-col items-start gap-3">
          <p className="text-sm text-muted-foreground">{t.auth.verifyPhoneNote}</p>
          {state?.error && <FormMessage>{state.error}</FormMessage>}
          <LoadingButton
            variant="outline"
            size="sm"
            busy={pending}
            label={t.auth.verifyNow}
            busyLabel={t.auth.sending}
          />
        </form>
      )}
    </div>
  );
}
