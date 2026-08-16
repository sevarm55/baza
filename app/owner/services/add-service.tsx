'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { saveService, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { ServiceFields } from './service-fields';
import { useT } from '@/lib/i18n/client';

/**
 * Новая услуга.
 *
 * Форма приходит по нажатию из заголовка раздела — там, где на неё
 * смотрят, — и уходит. Постоянного места под неё нет: услуги заводят при
 * запуске, а потом трогают раз в год, и держать ради этого прибор под
 * списком значит отодвигать вниз то, ради чего сюда ходят.
 *
 * Действия стоят в подвале окна, как у правки: «отмена» слева от
 * главного, главное справа — там, где рука заканчивает читать. Раньше
 * кнопка жила внутри формы лаймовой полосой во всю ширину, и два окна
 * одного раздела заканчивались по-разному.
 */
export function AddService({
  currencySymbol,
  step,
  variant = 'head',
}: {
  currencySymbol: string;
  step: number;
  /** в заголовке раздела — компактной кнопкой, в пустом месте — главной */
  variant?: 'head' | 'cta';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const [open, setOpen] = useState(false);

  /* Окно закрывается, когда сервер подтвердил запись. Состояние
     сверяется прямо в отрисовке, а не эффектом: эффект успел бы
     показать кадр с уже сохранённой, но ещё открытой формой. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'cta' ? 'btn btn-auto' : 'btn-inline btn-inline-primary'}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden />
        {t.settings.addService}
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side
        title={t.settings.newService}
        footer={
          <>
            <button type="button" className="btn-inline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <button form="service-new" className="btn btn-auto" disabled={pending}>
              {pending ? t.common.loading : t.settings.createService}
            </button>
          </>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлой недописанной услугой. */}
        <form key={String(open)} id="service-new" action={action} className="grid gap-3.5">
          <ServiceFields
            idPrefix="service-new"
            step={step}
            currencySymbol={currencySymbol}
            autoFocus
          />
          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
  );
}
