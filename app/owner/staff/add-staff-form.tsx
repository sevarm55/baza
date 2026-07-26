'use client';

import { useActionState, useEffect, useRef } from 'react';
import { addStaff, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function AddStaffForm({ staffRole }: { staffRole: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addStaff, null);
  const formRef = useRef<HTMLFormElement>(null);

  // очищаем форму после успеха, чтобы владелец мог сразу завести
  // следующего, не стирая поля руками
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-2.5">
      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{hy.settings.name}</span>
        <input className="field" name="name" required autoComplete="off" />
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
          autoComplete="off"
        />
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="grid gap-1.5">
          <span className="text-xs text-muted">
            {hy.auth.pin} · {hy.auth.pinHint}
          </span>
          <input
            className="field field-key"
            name="pin"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            autoComplete="off"
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs text-muted">
            {hy.settings.percent} · {staffRole}
          </span>
          <input
            className="field field-key"
            name="percent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            defaultValue={40}
            required
          />
        </label>
      </div>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn mt-1.5" disabled={pending}>
        {pending ? hy.common.loading : hy.settings.addStaff}
      </button>
    </form>
  );
}
