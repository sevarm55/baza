'use client';

import { useActionState, useEffect, useRef } from 'react';
import { addStaff, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function AddStaffForm({ staffRole }: { staffRole: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addStaff, null);
  const formRef = useRef<HTMLFormElement>(null);
  const firstRef = useRef<HTMLInputElement>(null);

  /* После успеха форма чистится и курсор возвращается в первое поле.
     Сотрудников заводят подряд — двоих-троих за раз, — и без этого
     после каждого приходится целиться мышью в то же самое поле. */
  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    firstRef.current?.focus();
  }, [state]);

  return (
    /* Без карточки: рамка вокруг рамок полей только добавляла высоты.
       Подписи здесь остаются — PIN и процент по одному полю не угадать.

       Имя и телефон стоят каждый на своей строке: колонка узкая, и в
       две половины телефон с кодом страны не помещается — placeholder
       обрезался на «+374 77 12…». */
    <form ref={formRef} action={action} className="grid gap-2.5">
      <label className="grid gap-1">
        <span className="label">{hy.settings.name}</span>
        <input
          ref={firstRef}
          className="field field-sm"
          name="name"
          required
          autoComplete="off"
        />
      </label>

      <label className="grid gap-1">
        <span className="label">{hy.auth.phone}</span>
        <input
          className="field field-sm"
          name="phone"
          type="tel"
          inputMode="tel"
          placeholder="+374 77 123 456"
          required
          autoComplete="off"
        />
      </label>

      <div className="grid grid-cols-2 gap-2.5">
        <label className="grid gap-1">
          <span className="label">
            {hy.auth.pin} · {hy.auth.pinHint}
          </span>
          <input
            className="field field-sm num !text-center"
            name="pin"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            required
            autoComplete="off"
          />
        </label>

        <label className="grid gap-1">
          <span className="label">
            {hy.settings.percent} · {staffRole}
          </span>
          <div className="relative">
            <input
              className="field field-sm num !pe-7 !text-center"
              name="percent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              defaultValue={40}
              required
            />
            <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13.5px] text-faint">
              %
            </span>
          </div>
        </label>
      </div>

      {state?.error && <p className="alert">{state.error}</p>}

      <button className="btn" disabled={pending}>
        {pending ? hy.common.loading : hy.settings.addStaff}
      </button>
    </form>
  );
}
