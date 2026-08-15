'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { saveService, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { useT } from '@/lib/i18n/client';

/**
 * Новая услуга.
 *
 * Форма стояла отдельным прибором под прейскурантом: заголовок «Новая
 * услуга», два поля в строку и кнопка — и всё это занимало место всегда,
 * хотя услуги заводят один раз при запуске и потом трогают раз в год.
 *
 * Здесь она приходит по нажатию из заголовка прейскуранта — там, где на
 * неё смотрят, — и уходит. Поля те же: название и цена, больше продукт
 * про услугу ничего не хранит.
 */
export function AddService({
  currencySymbol,
  step,
  variant = 'head',
}: {
  currencySymbol: string;
  step: number;
  /** в заголовке прибора — тихой кнопкой, в пустом месте — главной */
  variant?: 'head' | 'cta';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const [open, setOpen] = useState(false);

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'cta' ? 'btn btn-auto' : 'btn-inline'}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden />
        {t.settings.newService}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side title={t.settings.newService}>
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлой недописанной услугой. */}
        <form key={String(open)} action={action} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="label">{t.settings.name}</span>
            <input className="field auth-field" name="name" required autoComplete="off" autoFocus />
          </label>

          <label className="grid gap-1.5">
            <span className="label">{t.settings.price}</span>
            <div className="relative">
              <input
                className="field auth-field num !ps-9 !text-[19px] !font-semibold"
                name="price"
                type="number"
                inputMode="numeric"
                min={0}
                step={step}
                placeholder="0"
                required
              />
              <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[16px] text-faint">
                {currencySymbol}
              </span>
            </div>
          </label>

          <p className="note">{t.settings.priceNote}</p>

          <button className="btn mt-0.5" disabled={pending}>
            {pending ? t.common.loading : t.settings.addService}
          </button>

          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
  );
}
