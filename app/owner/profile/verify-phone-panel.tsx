'use client';

import { useActionState } from 'react';
import { verifyOwnPhoneAction, type VerifyPhoneState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { IconCheck } from '@/components/icons';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { useT } from '@/lib/i18n/client';

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
  phone,
}: {
  /** уже в маскированном виде — на экран, а не в запрос */
  phone: string;
}) {
  const [state, action, pending] = useActionState<VerifyPhoneState, FormData>(
    verifyOwnPhoneAction,
    null,
  );
  const t = useT();

  if (state?.step === 'done') {
    return (
      <p className="hint-good">
        <IconCheck width={16} height={16} />
        {t.auth.verified}
      </p>
    );
  }

  if (state?.step === 'code') {
    return (
      <form action={action} className="grid gap-3">
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <p className="text-[13.5px] text-muted">{t.auth.otpSent(phone)}</p>

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

        {state.error && <p className="alert">{state.error}</p>}

        <div>
          <button className="btn-inline" disabled={pending}>
            {pending ? t.auth.checking : t.auth.otpVerify}
          </button>
        </div>
      </form>
    );
  }

  return (
    /* Кнопка по содержимому, а не во всю ширину прибора.

       Пустая обведённая полоса в шестьсот пикселей на светлом приборе
       читалась не кнопкой, а пустым полем ввода — тем самым, из-за
       которого профиль и переделывали. Действие здесь предложение, а не
       главное дело страницы, и занимать столько места ему незачем. */
    <form action={action} className="grid justify-items-start gap-3">
      <p className="text-[13.5px] text-muted">{t.auth.verifyPhoneNote}</p>
      {state?.error && <p className="alert">{state.error}</p>}
      <button className="btn-inline" disabled={pending}>
        {pending ? t.auth.sending : t.auth.verifyNow}
      </button>
    </form>
  );
}
