'use client';

import { useActionState } from 'react';
import { signIn, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function LoginForm() {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null);

  return (
    <form action={action} className="grid gap-2.5">
      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.auth.phone}</span>
        <input
          className="field"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="+374 77 123 456"
          required
          autoFocus
          autoComplete="username"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.auth.pin}</span>
        <input
          className="field field-key"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          autoComplete="current-password"
        />
      </label>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn mt-1.5" disabled={pending}>
        {pending ? hy.common.loading : hy.auth.signIn}
      </button>
    </form>
  );
}
