'use client';

import { useActionState, useEffect, useState } from 'react';
import { archiveStaff, saveStaff, type FormState } from '@/app/actions';
import { formatPhone } from '@/lib/phone';
import { hy } from '@/lib/i18n/hy';

/**
 * Строка сотрудника с правкой на месте.
 *
 * Кнопка сохранения появляется только когда есть что сохранять, и она
 * подписана словом. Голая галочка не говорит ни что это кнопка, ни что
 * она сделает — приходится проверять нажатием, а это уже не интерфейс.
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
  const [draftName, setDraftName] = useState(name);
  const [draftPercent, setDraftPercent] = useState(String(percent));
  const [saved, setSaved] = useState(false);

  const dirty = draftName !== name || draftPercent !== String(percent);

  useEffect(() => {
    if (!state?.ok) return;
    setSaved(true);
    const t = setTimeout(() => setSaved(false), 2200);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={action} className="card grid gap-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-[12.5px] text-muted">{formatPhone(phone)}</span>
        <span className="label">{roleLabel}</span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-[9rem] flex-1 gap-1.5">
          <span className="label">{hy.settings.name}</span>
          <input
            className="field !py-2.5 !text-[15px]"
            name="name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            required
          />
        </label>

        <label className="grid w-[6.5rem] gap-1.5">
          <span className="label">{hy.settings.percent}</span>
          <div className="relative">
            <input
              className="field num !py-2.5 !pe-7 !text-[15px]"
              name="percent"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              value={draftPercent}
              onChange={(e) => setDraftPercent(e.target.value)}
              required
            />
            <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-sm text-faint">
              %
            </span>
          </div>
        </label>

        <div className="flex items-center gap-2 pb-0.5">
          {dirty && (
            <button className="btn-inline btn-inline-primary" disabled={pending}>
              {pending ? hy.common.loading : hy.settings.save}
            </button>
          )}
          {saved && !dirty && (
            <span className="text-[13px] font-semibold text-good">{hy.settings.saved}</span>
          )}
          {canRemove && (
            <button className="btn-inline btn-inline-danger" formAction={archiveStaff}>
              {hy.settings.remove}
            </button>
          )}
        </div>
      </div>

      {state?.error && <p className="alert">{state.error}</p>}
    </form>
  );
}
