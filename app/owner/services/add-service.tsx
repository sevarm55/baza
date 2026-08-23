'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { saveService, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { LoadingButton } from '@/components/loading';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';
import { ServiceFields } from './service-fields';

/**
 * Новая услуга.
 *
 * Форма приходит по нажатию из шапки раздела и уходит. Постоянного
 * места под неё нет: услуги заводят при запуске, а потом трогают раз в
 * год, и держать ради этого панель под списком значит отодвигать вниз
 * то, ради чего сюда ходят.
 */
export function AddService({
  currencySymbol,
  step,
  tiers,
  variant = 'default',
}: {
  currencySymbol: string;
  step: number;
  /** классы бизнеса; пусто — ряда цен по классам в форме нет */
  tiers: string[];
  /** в шапке и в пустом месте главной кнопкой, в ряду тихой */
  variant?: 'default' | 'outline';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveService, null);
  const [open, setOpen] = useState(false);

  /* Лист закрывается, когда сервер подтвердил запись. Состояние
     сверяется прямо в отрисовке, а не эффектом: эффект успел бы показать
     кадр с уже сохранённой, но ещё открытой формой. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t.settings.addService}
      </Button>

      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.settings.newService}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="service-new"
              busy={pending}
              label={t.settings.createService}
              busyLabel={t.common.adding}
            />
          </SheetActions>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлой недописанной услугой. */}
        <form
          key={String(open)}
          id="service-new"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-4"
        >
          <ServiceFields
            idPrefix="service-new"
            step={step}
            currencySymbol={currencySymbol}
            tiers={tiers}
            autoFocus
          />
          {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        </form>
      </EntitySheet>
    </>
  );
}
