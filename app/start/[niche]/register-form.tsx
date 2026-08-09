'use client';

import { useActionState } from 'react';
import { registerBusiness, type FormState } from '@/app/actions';
import { PinInput } from '@/components/pin-input';
import { TRIAL_DAYS } from '@/lib/plan';
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
    <form action={action} className="grid gap-4">
      <input type="hidden" name="niche" value={nicheKey} />

      <label className="grid gap-2">
        <span className="label">{hy.onboarding.bizName}</span>
        <input
          className="field !text-[16px]"
          name="businessName"
          defaultValue={defaultName}
          required
          autoComplete="organization"
        />
      </label>

      <label className="grid gap-2">
        <span className="label">{hy.onboarding.ownerName}</span>
        <input className="field !text-[16px]" name="ownerName" required autoComplete="name" />
      </label>

      <label className="grid gap-2">
        <span className="label">{hy.auth.phone}</span>
        <div className="relative">
          <span className="num pointer-events-none absolute inset-y-0 start-4 flex items-center text-[16px] text-faint">
            +374
          </span>
          <input
            className="field num !ps-[4.4rem] !text-[16px]"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="77 123 456"
            required
            autoComplete="tel"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="label">
          {hy.auth.pin} · {hy.auth.pinHint}
        </span>
        {/* Здесь без авто-отправки: регистрация — не то действие, которое
            должно случаться от последней набранной цифры. */}
        <PinInput submitOnComplete={false} />
      </label>

      {state?.error && <p className="alert">{state.error}</p>}

      <div className="mt-1 grid gap-2">
        <button className="btn" disabled={pending}>
          {pending ? hy.common.loading : hy.onboarding.createAndStart}
        </button>
        <p className="text-center text-[13.5px] text-faint">
          {hy.onboarding.freeDays(TRIAL_DAYS)}
        </p>
      </div>
    </form>
  );
}
