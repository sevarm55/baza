'use client';

import { useActionState } from 'react';
import { changePinAction, type FormState } from '@/app/actions';
import { useT } from '@/lib/i18n/client';

/**
 * Смена PIN.
 *
 * Оба поля по четыре цифры и рядом: старый код человек помнит, новый
 * придумывает здесь же. Предупреждение о выходе всех устройств стоит
 * ДО кнопки — это последствие, а не сноска.
 */
export function ChangePinForm() {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(changePinAction, null);

  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5">
          <span className="label">{t.auth.currentPin}</span>
          <input
            className="field num !text-center"
            name="current"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="current-password"
            required
          />
        </label>

        <label className="grid gap-1.5">
          <span className="label">
            {t.auth.newPin} · {t.auth.pinHint}
          </span>
          <input
            className="field num !text-center"
            name="next"
            type="password"
            inputMode="numeric"
            pattern="[0-9]{4}"
            maxLength={4}
            autoComplete="new-password"
            required
          />
        </label>
      </div>

      <p className="note">{t.auth.pinChangedNote}</p>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn btn-ghost" disabled={pending}>
        {pending ? t.common.loading : t.auth.changePin}
      </button>
    </form>
  );
}
