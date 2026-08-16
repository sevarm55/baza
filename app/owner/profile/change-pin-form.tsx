'use client';

import { useActionState } from 'react';
import { changePinAction, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PIN_LENGTH } from '@/lib/phone';
import { authDict, type AuthLocale } from '@/lib/i18n/auth';
import { hy } from '@/lib/i18n/hy';

/**
 * Смена PIN.
 *
 * Оба поля по шесть цифр и рядом: старый код человек помнит, новый
 * придумывает здесь же. Предупреждение о выходе всех устройств стоит
 * ДО кнопки — это последствие, а не сноска.
 *
 * Клетки те же, что на входе, и это не украшательство: код набирают в
 * одном виде и вводят в другом ровно до первой ошибки. Одинаковое поле
 * в обоих местах — самая дешёвая правильная подсказка.
 */
export function ChangePinForm({ locale }: { locale: AuthLocale }) {
  const [state, action, pending] = useActionState<FormState, FormData>(changePinAction, null);
  const dict = authDict(locale);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <CodeInput
            name="current"
            length={PIN_LENGTH}
            /* Текущий код у старых аккаунтов четырёхзначный: здесь он
               сверяется, а не создаётся. Новый ниже — строго шесть. */
            minLength={4}
            label={hy.auth.currentPin}
            title={hy.auth.currentPin}
            autoComplete="current-password"
            revealable
            revealLabel={dict.pin.show}
            hideLabel={dict.pin.hide}
            enteredLabel={dict.pin.entered}
            invalid={Boolean(state?.error)}
          />
        </div>

        <div className="grid gap-2">
          <CodeInput
            name="next"
            length={PIN_LENGTH}
            label={hy.auth.newPin}
            title={`${hy.auth.newPin} · ${hy.auth.pinHint}`}
            autoComplete="new-password"
            revealable
            revealLabel={dict.pin.show}
            hideLabel={dict.pin.hide}
            enteredLabel={dict.pin.entered}
            invalid={Boolean(state?.error)}
          />
        </div>
      </div>

      <p className="note">{hy.auth.pinChangedNote}</p>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn btn-ghost" disabled={pending}>
        {pending ? hy.common.loading : hy.auth.changePin}
      </button>
    </form>
  );
}
