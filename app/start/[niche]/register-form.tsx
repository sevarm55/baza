'use client';

import { useActionState } from 'react';
import { registerBusiness, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function RegisterForm({
  nicheKey,
  defaultName,
}: {
  nicheKey: string;
  defaultName: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(
    registerBusiness,
    null,
  );

  return (
    <form action={action} className="grid gap-2.5">
      <input type="hidden" name="niche" value={nicheKey} />

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.onboarding.bizName}</span>
        <input
          className="field"
          name="businessName"
          defaultValue={defaultName}
          required
          autoComplete="organization"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.onboarding.ownerName}</span>
        <input className="field" name="ownerName" required autoComplete="name" />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.auth.phone}</span>
        <input
          className="field"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="+374 77 123 456"
          required
          autoComplete="tel"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">
          {hy.auth.pin} · {hy.auth.pinHint}
        </span>
        <input
          className="field field-key"
          name="pin"
          type="password"
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          required
          autoComplete="new-password"
        />
      </label>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn mt-1.5" disabled={pending}>
        {pending ? hy.common.loading : hy.onboarding.createAccount}
      </button>
    </form>
  );
}
