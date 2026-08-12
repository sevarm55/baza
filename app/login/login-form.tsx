'use client';

import { useActionState } from 'react';
import { signIn, type FormState } from '@/app/actions';
import { PinInput } from '@/components/pin-input';
import { hy } from '@/lib/i18n/hy';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2">
        <span className="label">{hy.auth.phone}</span>
        <div className="relative">
          {/* Код страны нарисован в поле, а не набирается: клиенты все
              местные, и восемь лишних нажатий каждый раз — это налог
              на вход, который платят зря. */}
          <span className="num pointer-events-none absolute inset-y-0 start-4 flex items-center text-[16px] text-faint">
            +374
          </span>
          <input
            className="field auth-field num !ps-[4.4rem] !text-[16px]"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="77 123 456"
            required
            /* без autoFocus: на телефоне он тут же выбрасывает клавиатуру
               и подбрасывает вёрстку, а человек ещё не решил, входит он
               или регистрируется */
            autoComplete="username"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="label">{hy.auth.pin}</span>
        <PinInput />
      </label>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn mt-1" disabled={pending}>
        {pending ? hy.common.loading : hy.auth.signIn}
      </button>
    </form>
  );
}
