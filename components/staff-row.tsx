'use client';

import { useActionState, useState } from 'react';
import { archiveStaff, saveStaff, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatPhone } from '@/lib/phone';
import { personColor } from '@/lib/person-color';
import { hy } from '@/lib/i18n/hy';

/**
 * Человек в списке.
 *
 * Строка читается: имя, телефон, процент. Точка слева — того же цвета,
 * которым этот человек отмечен в ленте и на смене; один цвет на весь
 * продукт, и «кто это» узнаётся раньше, чем прочитано имя.
 *
 * Правка — окном, как у услуги: процент, который меняется прямо в
 * списке от случайного касания, — это чужие деньги.
 */
export function StaffRow({
  id,
  name,
  phone,
  percent,
  roleLabel,
  canRemove,
}: {
  id: string;
  name: string;
  phone: string;
  percent: number;
  roleLabel: string;
  canRemove: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveStaff, null);
  const [open, setOpen] = useState(false);

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <button type="button" className="row-open" onClick={() => setOpen(true)}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span
            className="size-2 shrink-0 rounded-full"
            style={{ background: personColor(name) }}
            aria-hidden
          />
          <span className="min-w-0">
            <span className="block truncate text-[15px] font-medium">{name}</span>
            <span className="num block truncate text-[13.5px] text-muted">
              {formatPhone(phone)} · {roleLabel}
            </span>
          </span>
        </span>
        <span className="num text-[15px] tabular-nums">
          {percent} <span className="text-faint">%</span>
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
            <span className="label">
              {hy.settings.percent} · {roleLabel}
            </span>
            <div className="relative">
              <input
                className="field num !pe-9 text-end"
                name="percent"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                defaultValue={percent}
                required
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                %
              </span>
            </div>
          </label>

          {/* Телефон правке не подлежит: по нему человек входит, и смена
              номера — это уже другой человек. Показан, чтобы владелец
              видел, кому диктовал PIN. */}
          <p className="num text-[13.5px] text-faint">{formatPhone(phone)}</p>

          {state?.error && <p className="alert">{state.error}</p>}

          <button className="btn mt-1" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        </form>

        {/* Себя отключить нельзя — владелец потеряет доступ в кабинет. */}
        {canRemove && (
          <form action={archiveStaff} className="mt-3 flex justify-end">
            <input type="hidden" name="id" value={id} />
            <button className="btn-inline btn-inline-danger">{hy.settings.remove}</button>
          </form>
        )}
      </Sheet>
    </>
  );
}
