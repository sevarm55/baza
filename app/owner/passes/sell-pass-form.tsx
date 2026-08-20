'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { sellPassAction, type FormState } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

type Service = { id: string; name: string; price: number };

export function SellPassForm({
  services,
  clientIdLabel,
  clientIdPlaceholder,
}: {
  services: Service[];
  clientIdLabel: string;
  clientIdPlaceholder: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(sellPassAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  const [serviceId, setServiceId] = useState(services[0]?.id ?? '');
  const [uses, setUses] = useState(10);
  const [price, setPrice] = useState<number | ''>('');

  const service = services.find((s) => s.id === serviceId);
  const full = service ? service.price * uses : 0;
  const actual = price === '' ? full : price;
  const discount = full > 0 ? Math.round((1 - actual / full) * 100) : 0;

  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    setPrice('');
    setUses(10);
  }, [state]);

  return (
    <form
      ref={formRef}
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      className="card grid gap-2.5"
    >
      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{clientIdLabel}</span>
        <input
          className="field"
          name="clientKey"
          placeholder={clientIdPlaceholder}
          required
          autoComplete="off"
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-xs text-muted">{t.settings.services}</span>
        <select
          className="field"
          name="serviceId"
          value={serviceId}
          onChange={(e) => setServiceId(e.target.value)}
          required
        >
          {services.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>

      <div className="grid grid-cols-3 gap-2.5">
        <label className="grid gap-1.5">
          <span className="text-xs text-muted">{t.passes.uses}</span>
          <input
            className="field !text-center"
            name="totalUses"
            type="number"
            min={1}
            value={uses}
            onChange={(e) => setUses(Number(e.target.value))}
            required
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs text-muted">{t.passes.price}</span>
          <input
            className="field !text-center"
            name="price"
            type="number"
            min={0}
            placeholder={String(full)}
            value={price}
            onChange={(e) => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
            required
          />
        </label>

        <label className="grid gap-1.5">
          <span className="text-xs text-muted">{t.passes.validDays}</span>
          <input
            className="field !text-center"
            name="validDays"
            type="number"
            min={0}
            defaultValue={30}
            placeholder={t.passes.unlimited}
          />
        </label>
      </div>

      {/* Владелец должен видеть, какую скидку он на самом деле даёт.
          «10 по цене 8» на глаз считается неправильно чаще, чем кажется. */}
      {service && (
        <p className="text-[13.5px] text-muted">
          {uses} × {service.name} = {full.toLocaleString('en-US').replace(/,/g, ' ')}
          {discount > 0 && <span className="text-good"> · −{discount}%</span>}
        </p>
      )}

      {state?.error && <p className="alert">{state.error}</p>}

      <LoadingButton
        className="btn"
        busy={pending}
        label={t.passes.sell}
        busyLabel={t.common.adding}
      />
    </form>
  );
}
