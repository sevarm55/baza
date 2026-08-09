'use client';

import { useActionState, useEffect, useRef } from 'react';
import { saveService, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function AddServiceForm({ currencySymbol }: { currencySymbol: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  /* Услуги заводят пачкой — весь прейскурант за один заход. Курсор
     возвращается в название, чтобы следующую можно было набрать сразу. */
  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    firstRef.current?.focus();
  }, [state]);

  /* Пустая строка подписей не имеет: что вводить, говорят подсказки внутри
     полей — форма и так стоит под заголовком «Новая услуга». */
  return (
    <form ref={formRef} action={action} className="row-edit">
      <input
        ref={firstRef}
        className="field field-sm w-full sm:w-auto sm:min-w-[8rem] sm:flex-1"
        name="name"
        aria-label={hy.settings.name}
        placeholder={hy.settings.name}
        required
        autoComplete="off"
      />

      <div className="relative w-[7.5rem] shrink-0">
        <input
          className="field field-sm num h-full !ps-7"
          name="price"
          type="number"
          inputMode="numeric"
          min={0}
          aria-label={hy.settings.price}
          placeholder={hy.settings.price}
          required
        />
        <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-[13.5px] text-faint">
          {currencySymbol}
        </span>
      </div>

      <button className="btn-inline btn-inline-primary ms-auto" disabled={pending}>
        {pending ? hy.common.loading : hy.settings.addService}
      </button>

      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
