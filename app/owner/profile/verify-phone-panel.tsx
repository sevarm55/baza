'use client';

import { useActionState } from 'react';
import { verifyOwnPhoneAction, type VerifyPhoneState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { IconCheck } from '@/components/icons';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { authDict, type AuthLocale } from '@/lib/i18n/auth';

/**
 * Подтверждение своего номера — для тех, кто регистрировался до кода из
 * SMS.
 *
 * Предложение, а не требование. Заставить владельца подтверждать номер
 * посреди рабочего дня из-за нашего переезда — не тот размен: мойка
 * работает, машины едут, а он ищет телефон. Поэтому здесь нет ни
 * баннера на весь экран, ни блокировки: панель в профиле, одна строка
 * объяснения и кнопка.
 *
 * Объяснение при этом честное и конкретное: без подтверждённого номера
 * PIN не восстановить. Это единственное, что человек теряет, и говорить
 * ему что-то другое незачем.
 */
export function VerifyPhonePanel({
  locale,
  phone,
}: {
  locale: AuthLocale;
  /** уже в маскированном виде — на экран, а не в запрос */
  phone: string;
}) {
  const [state, action, pending] = useActionState<VerifyPhoneState, FormData>(
    verifyOwnPhoneAction,
    null,
  );
  const dict = authDict(locale);

  if (state?.step === 'done') {
    return (
      <p className="hint-good">
        <IconCheck width={16} height={16} />
        {dict.security.verified}
      </p>
    );
  }

  if (state?.step === 'code') {
    return (
      <form action={action} className="grid gap-3">
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <p className="text-[13.5px] text-muted">{dict.otp.description(phone)}</p>

        <CodeInput
          name="code"
          length={CODE_LENGTH}
          label={dict.pin.otpGroupLabel(CODE_LENGTH)}
          title={dict.otp.code}
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          enteredLabel={dict.pin.entered}
          invalid={Boolean(state.error)}
        />

        {state.error && <p className="alert">{state.error}</p>}

        <button className="btn btn-ghost" disabled={pending}>
          {pending ? dict.otp.verifying : dict.otp.verify}
        </button>
      </form>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <p className="text-[13.5px] text-muted">{dict.security.verifyPhoneNote}</p>
      {state?.error && <p className="alert">{state.error}</p>}
      <button className="btn btn-ghost" disabled={pending}>
        {pending ? dict.register.submitting : dict.security.verifyNow}
      </button>
    </form>
  );
}
