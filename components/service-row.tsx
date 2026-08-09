'use client';

import { useActionState, useState } from 'react';
import { archiveService, saveService, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { hy } from '@/lib/i18n/hy';

/**
 * Услуга в прейскуранте.
 *
 * В списке — строка, а не форма: название и цена читаются, как в
 * бумажном прейскуранте. Правка открывается окном по нажатию на строку.
 *
 * Так было не всегда: раньше каждая строка состояла из двух полей
 * ввода, и десять услуг давали двадцать одинаковых коробок, среди
 * которых не читалось ни одной цены. Цену меняют раз в полгода, а
 * смотрят на неё каждый день — интерфейс должен быть устроен под то,
 * что делают чаще.
 */
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
  const [open, setOpen] = useState(false);

  /* Окно закрывается, когда сервер подтвердил запись. Состояние
     сверяется прямо в рендере, а не эффектом: эффект успел бы показать
     кадр с уже сохранённым, но ещё открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <button type="button" className="row-open" onClick={() => setOpen(true)}>
        <span className="truncate text-[15px] font-medium">{name}</span>
        <span className="num text-[15px] tabular-nums">
          {price} <span className="text-faint">{currencySymbol}</span>
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={name}>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="id" value={id} />

          <label className="grid gap-1.5">
            <span className="label">{hy.settings.name}</span>
            <input className="field" name="name" defaultValue={name} required autoFocus />
          </label>

          <label className="grid gap-1.5">
            <span className="label">{hy.settings.price}</span>
            <div className="relative">
              <input
                className="field num !pe-9 text-end"
                name="price"
                type="number"
                inputMode="numeric"
                min={0}
                step={step}
                defaultValue={price}
                required
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                {currencySymbol}
              </span>
            </div>
          </label>

          {state?.error && <p className="alert">{state.error}</p>}

          <button className="btn mt-1" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        </form>

        {/* Удаление — внизу окна и тише сохранения: сюда пришли менять
            цену, а не убирать услугу. В списке этой кнопки больше нет
            вовсе — десять кнопок «убрать» в прейскуранте предлагали
            удалить там, где просто читают. */}
        <form action={archiveService} className="mt-3 flex justify-end">
          <input type="hidden" name="id" value={id} />
          <button className="btn-inline btn-inline-danger">{hy.settings.remove}</button>
        </form>
      </Sheet>
    </>
  );
}
