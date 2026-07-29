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
    <form action={action} className="card grid gap-2.5 !p-3">
      <input type="hidden" name="id" value={id} />

      <div className="flex items-baseline justify-between gap-3">
        <span className="num text-[12.5px] text-muted">{formatPhone(phone)}</span>
        <span className="label">{roleLabel}</span>
      </div>

      {/* Подписи полей — в aria-label: имя и число с процентом читаются
          и без надписи сверху, а строк на экране много. */}
      <div className="row-edit">
        <input
          className="field field-sm w-full sm:w-auto sm:min-w-[8rem] sm:flex-1"
          name="name"
          aria-label={hy.settings.name}
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          required
        />

        <div className="relative w-[6rem] shrink-0">
          <input
            className="field field-sm num h-full !pe-7"
            name="percent"
            type="number"
            inputMode="numeric"
            min={0}
            max={100}
            aria-label={hy.settings.percent}
            value={draftPercent}
            onChange={(e) => setDraftPercent(e.target.value)}
            required
          />
          <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">
            %
          </span>
        </div>

        <div className="ms-auto flex gap-2">
          {dirty && (
            <button className="btn-inline btn-inline-primary" disabled={pending}>
              {pending ? hy.common.loading : hy.settings.save}
            </button>
          )}
          {saved && !dirty && (
            <span className="self-center text-[13px] font-semibold text-good">
              {hy.settings.saved}
            </span>
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
