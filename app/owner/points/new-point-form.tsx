'use client';

import { useActionState } from 'react';
import { createPoint, type FormState } from '@/app/actions';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';

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
  niches: { key: string; name: string }[];
  /** потолок точек достигнут: кнопка видна, но не нажимается */
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
      className="flex flex-col gap-4"
    >
      <Field>
        <FieldLabel htmlFor="point-name">{t.onboarding.bizName}</FieldLabel>
        <Input id="point-name" name="businessName" required autoComplete="off" />
      </Field>

      {/* Ниша одна — выбирать не из чего, и список с единственным
          вариантом только просит нажать на себя зря. */}
      {only ? (
        <input type="hidden" name="niche" value={only.key} />
      ) : (
        <Field>
          <FieldLabel htmlFor="point-niche">{t.onboarding.chooseNiche}</FieldLabel>
          <NativeSelect id="point-niche" name="niche" required defaultValue="" className="w-full">
            <NativeSelectOption value="" disabled>
              {t.onboarding.chooseNiche}
            </NativeSelectOption>
            {niches.map((n) => (
              <NativeSelectOption key={n.key} value={n.key}>
                {n.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Field>
      )}

      {state?.error && <FormMessage tone="error">{state.error}</FormMessage>}

      {/* Точку заводят раз в год: кнопка своей ширины, а не во всю
          колонку. */}
      <LoadingButton
        className="self-start"
        busy={pending}
        disabled={disabled}
        label={t.points.add}
        busyLabel={t.common.adding}
      />
    </form>
  );
}
