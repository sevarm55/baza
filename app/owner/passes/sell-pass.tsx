'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { sellPassAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LoadingButton } from '@/components/loading';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormGrid, FormMessage } from '@/components/patterns/form';
import { formatMoney, toMinor } from '@/lib/money';
import { useT } from '@/lib/i18n/client';

type Service = { id: string; name: string; price: number };

const DEFAULT_USES = 10;

/**
 * Продажа абонемента: кнопка в шапке и лист с формой.
 *
 * Владелец должен видеть, какую скидку он на самом деле даёт: «10 по
 * цене 8» на глаз считается неправильно чаще, чем кажется. Поэтому под
 * полями живой пример: полная стоимость и процент скидки.
 */
export function SellPass({
  services,
  currency,
  clientIdLabel,
  clientIdPlaceholder,
}: {
  services: Service[];
  currency: string;
  clientIdLabel: string;
  clientIdPlaceholder: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(sellPassAction, null);
  const [open, setOpen] = useState(false);

  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [uses, setUses] = useState(DEFAULT_USES);
  const [price, setPrice] = useState<number | ''>('');

  function reset() {
    setServiceId(services[0]?.id ?? '');
    setUses(DEFAULT_USES);
    setPrice('');
  }

  /* Лист закрывается и поля чистятся, когда сервер подтвердил продажу.
     Сверяем в отрисовке, а не эффектом: эффект показал бы кадр с уже
     проданным, но ещё открытым окном. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) {
      reset();
      setOpen(false);
    }
  }

  function start() {
    reset();
    setOpen(true);
  }

  const service = services.find((s) => s.id === serviceId);
  const full = service ? service.price * uses : 0;
  const actual = price === '' ? full : price;
  const discount = full > 0 ? Math.round((1 - actual / full) * 100) : 0;
  const fullLabel = formatMoney(toMinor(full, currency), currency, t.locale);

  return (
    <>
      <Button onClick={start}>
        <Plus data-icon="inline-start" aria-hidden />
        {t.passes.sell}
      </Button>

      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.passes.sell}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="pass-sell"
              busy={pending}
              label={t.passes.sell}
              busyLabel={t.common.adding}
            />
          </SheetActions>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не продав, и открыл
            снова — поля пустые. */}
        <form
          key={String(open)}
          id="pass-sell"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <Field>
            <FieldLabel htmlFor="pass-client">{clientIdLabel}</FieldLabel>
            <Input
              id="pass-client"
              name="clientKey"
              placeholder={clientIdPlaceholder}
              required
              autoComplete="off"
              autoFocus
              className="num"
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="pass-service">{t.settings.services}</FieldLabel>
            <NativeSelect
              id="pass-service"
              name="serviceId"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
              required
              className="w-full"
            >
              {services.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>

          <FormGrid columns={3}>
            <Field>
              <FieldLabel htmlFor="pass-uses">{t.passes.uses}</FieldLabel>
              <Input
                id="pass-uses"
                name="totalUses"
                type="number"
                inputMode="numeric"
                min={1}
                value={uses}
                onChange={(e) => setUses(Number(e.target.value))}
                required
                className="num"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="pass-price">{t.passes.price}</FieldLabel>
              <Input
                id="pass-price"
                name="price"
                type="number"
                inputMode="numeric"
                min={0}
                placeholder={String(full)}
                value={price}
                onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                required
                className="num"
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="pass-days">{t.passes.validDays}</FieldLabel>
              <Input
                id="pass-days"
                name="validDays"
                type="number"
                inputMode="numeric"
                min={0}
                defaultValue={30}
                placeholder={t.passes.unlimited}
                className="num"
              />
            </Field>
          </FormGrid>

          {service && (
            <div className="num rounded-md bg-muted p-3 text-sm">
              {uses} × {service.name} = {fullLabel}
              {discount > 0 && <span className="text-success"> · −{discount}%</span>}
            </div>
          )}

          {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}
        </form>
      </EntitySheet>
    </>
  );
}
