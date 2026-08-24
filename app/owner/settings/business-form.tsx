'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { saveBusiness } from '@/app/actions';
import { LoadingButton, useAsyncAction } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Название бизнеса.
 *
 * Кнопка ведёт себя как в строках услуг и сотрудников: пока править
 * нечего, её нет, но место под неё занято, и поле не дёргается на
 * первой же набранной букве. Само действие состояния не возвращает,
 * поэтому занятость, отметка об успехе и отказ живут здесь.
 */
export function BusinessForm({ name }: { name: string }) {
  const t = useT();
  const router = useRouter();
  const [draft, setDraft] = useState(name);
  /* Что лежит на сервере, по нашим сведениям: после удачи это набранное,
     и кнопка прячется, не дожидаясь перерисовки страницы. */
  const [saved, setSaved] = useState(name);

  const { run, running, done, error } = useAsyncAction(saveBusiness, {
    message: () => t.errors.generic,
    onDone: () => {
      setSaved(draft.trim());
      /* Название стоит не только здесь: оно в колонке и в шапке, и
         полотно обновляется целиком. */
      router.refresh();
    },
  });

  const dirty = draft.trim() !== saved && draft.trim().length >= 2;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!dirty) return;
        run(new FormData(e.currentTarget));
      }}
    >
      <Field>
        <FieldLabel htmlFor="business-name">{t.settings.businessName}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="business-name"
            name="name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            minLength={2}
            required
            className="min-w-0 flex-1"
          />
          <LoadingButton
            busy={running}
            done={done}
            label={t.settings.save}
            busyLabel={t.common.saving}
            doneLabel={t.common.saved}
            /* На телефоне спрятанная кнопка не должна занимать место:
               `invisible` держит за собой сто точек пустоты, и поле
               рядом с ней становится вдвое у́же нужного. */
            className={cn(!dirty && !running && !done && 'invisible max-md:hidden')}
          />
        </div>
        {error && <FormMessage>{error}</FormMessage>}
      </Field>
    </form>
  );
}
