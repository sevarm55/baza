'use client';

import { useActionState } from 'react';
import { createPoint, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Новая точка: название и ниша, больше ничего.
 *
 * Имя владельца, код и телефон не спрашиваем — человек уже вошёл, и всё
 * это про него известно. Форма из двух полей вместо пяти: заводит он её
 * не с улицы, а изнутри своего же кабинета.
 */
export function NewPointForm({
  niches,
  disabled,
}: {
  niches: { key: string; name: string; icon: string }[];
  disabled: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(createPoint, null);
  const only = niches.length === 1 ? niches[0] : null;

  return (
    <form action={action} className="grid gap-2.5">
      <label className="grid gap-1">
        <span className="label">{hy.onboarding.bizName}</span>
        <input className="field field-sm" name="businessName" required autoComplete="off" />
      </label>

      {/* Ниша одна — выбирать не из чего, и селект с единственным
          вариантом только просит нажать на себя зря. */}
      {only ? (
        <input type="hidden" name="niche" value={only.key} />
      ) : (
        <label className="grid gap-1">
          <span className="label">{hy.onboarding.chooseNiche}</span>
          <select className="field field-sm" name="niche" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {niches.map((n) => (
              <option key={n.key} value={n.key}>
                {n.icon} {n.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {state?.error && <p className="note text-red-600">{state.error}</p>}

      <button className="btn justify-self-start" disabled={pending || disabled}>
        {pending ? hy.common.loading : hy.points.add}
      </button>
    </form>
  );
}
