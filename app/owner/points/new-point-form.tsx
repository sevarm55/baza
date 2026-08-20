'use client';

import { useActionState } from 'react';
import { createPoint, type FormState } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

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
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(createPoint, null);
  const only = niches.length === 1 ? niches[0] : null;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
      className="grid gap-2.5"
    >
      <label className="grid gap-1">
        <span className="label">{t.onboarding.bizName}</span>
        <input className="field field-sm" name="businessName" required autoComplete="off" />
      </label>

      {/* Ниша одна — выбирать не из чего, и селект с единственным
          вариантом только просит нажать на себя зря. */}
      {only ? (
        <input type="hidden" name="niche" value={only.key} />
      ) : (
        <label className="grid gap-1">
          <span className="label">{t.onboarding.chooseNiche}</span>
          <select className="field field-sm" name="niche" required defaultValue="">
            <option value="" disabled>
              —
            </option>
            {niches.map((n) => (
              <option key={n.key} value={n.key}>
                {n.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {state?.error && <p className="alert mt-1">{state.error}</p>}

      {/* `justify-self` сам по себе ничего не делал: у `.btn` ширина
          100%, и кнопка всё равно растягивалась во всю колонку. Точку
          заводят раз в год — обещать этим действием размер главной
          кнопки экрана незачем. */}
      <LoadingButton
        className="btn !w-auto justify-self-start px-7"
        busy={pending}
        disabled={disabled}
        label={t.points.add}
        busyLabel={t.common.adding}
      />
    </form>
  );
}
