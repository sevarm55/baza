'use client';

import { useActionState, useState } from 'react';

import { saveOwnName, type FormState } from '@/app/actions';
import { LoadingButton } from '@/components/loading';
import { Field, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Своё имя.
 *
 * Кнопка ведёт себя как в строках услуг и филиалов: пока править нечего,
 * её не видно, но место под неё занято, и поле не дёргается на первой
 * же набранной букве.
 */
export function NameForm({ name }: { name: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveOwnName, null);
  const [draft, setDraft] = useState(name);
  const dirty = draft.trim() !== name && draft.trim().length >= 2;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <Field>
        <FieldLabel htmlFor="profile-name">{t.settings.name}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="profile-name"
            name="name"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            minLength={2}
            required
            className="min-w-0 flex-1"
          />
          <LoadingButton
            busy={pending}
            label={t.settings.save}
            busyLabel={t.common.saving}
            /* На телефоне спрятанная кнопка не должна занимать место:
               там поле и так узкое, а `invisible` держит за собой сто
               точек пустоты. */
            className={cn(!dirty && !pending && 'invisible max-md:hidden')}
          />
        </div>
        <FieldError>{state?.error}</FieldError>
      </Field>
    </form>
  );
}
