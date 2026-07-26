'use client';

import { useActionState, useEffect, useState } from 'react';
import { archiveService, saveService, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/** Услуга с правкой на месте. Логика та же, что у строки сотрудника:
 *  подписанная кнопка появляется, только когда есть что сохранять. */
export function ServiceRow({
  id,
  name,
  price,
  step,
  currencySymbol,
}: {
  id: string;
  name: string;
  price: number;
  step: number;
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const [draftName, setDraftName] = useState(name);
  const [draftPrice, setDraftPrice] = useState(String(price));
  const [saved, setSaved] = useState(false);

  const dirty = draftName !== name || draftPrice !== String(price);

  useEffect(() => {
    if (!state?.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={action} className="card flex flex-wrap items-end gap-2">
      <input type="hidden" name="id" value={id} />

      <label className="grid min-w-[10rem] flex-1 gap-1.5">
        <span className="label">{hy.settings.name}</span>
        <input
          className="field !py-2.5 !text-[15px]"
          name="name"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          required
        />
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
            step={step}
            value={draftPrice}
            onChange={(e) => setDraftPrice(e.target.value)}
            required
          />
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">
            {currencySymbol}
          </span>
        </div>
      </label>

      <div className="flex items-center gap-2 pb-0.5">
        {dirty && (
          <button className="btn-inline btn-inline-primary" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        )}
        {saved && !dirty && (
          <span className="text-[13px] font-semibold text-good">{hy.settings.saved}</span>
        )}
        <button className="btn-inline btn-inline-danger" formAction={archiveService}>
          {hy.settings.remove}
        </button>
      </div>

      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
