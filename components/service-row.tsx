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

  /* Подписи полей ушли в aria-label. В списке из десятка услуг «Անուն» и
     «Գին» над каждой строкой — десять одинаковых надписей, которые никто
     не читает после первой; название и число с драмом говорят за себя. */
  return (
    <form action={action} className="row-edit">
      <input type="hidden" name="id" value={id} />

      {/* На узком экране название занимает всю строку, цена и кнопки
          уходят под него: втроём они в 375 пикселей не помещаются. */}
      <input
        className="field field-sm w-full sm:w-auto sm:min-w-[8rem] sm:flex-1"
        name="name"
        aria-label={hy.settings.name}
        value={draftName}
        onChange={(e) => setDraftName(e.target.value)}
        required
      />

      <div className="relative w-[7.5rem] shrink-0">
        <input
          className="field field-sm num h-full !pe-7"
          name="price"
          type="number"
          inputMode="numeric"
          min={0}
          step={step}
          aria-label={hy.settings.price}
          value={draftPrice}
          onChange={(e) => setDraftPrice(e.target.value)}
          required
        />
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">
          {currencySymbol}
        </span>
      </div>

      <div className="ms-auto flex gap-2">
        {dirty && (
          <button className="btn-inline btn-inline-primary" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        )}
        {saved && !dirty && (
          <span className="self-center text-[13px] font-semibold text-good">
            {hy.settings.saved}
          </span>
        )}
        <button className="btn-inline btn-inline-danger" formAction={archiveService}>
          {hy.settings.remove}
        </button>
      </div>

      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
