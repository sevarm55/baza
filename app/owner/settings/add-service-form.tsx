'use client';

import { useActionState, useEffect, useRef } from 'react';
import { saveService, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function AddServiceForm({ currencySymbol }: { currencySymbol: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="card flex flex-wrap items-end gap-2">
      <label className="grid min-w-[10rem] flex-1 gap-1.5">
        <span className="label">{hy.settings.name}</span>
        <input className="field !py-2.5 !text-[15px]" name="name" required autoComplete="off" />
      </label>

      <label className="grid w-[8.5rem] gap-1.5">
        <span className="label">{hy.settings.price}</span>
        <div className="relative">
          <input
            className="field num !py-2.5 !pe-8 !text-[15px]"
            name="price"
            type="number"
            inputMode="numeric"
            min={0}
            required
          />
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">
            {currencySymbol}
          </span>
        </div>
      </label>

      <button className="btn-inline btn-inline-primary mb-0.5" disabled={pending}>
        {pending ? hy.common.loading : hy.settings.addService}
      </button>

      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
