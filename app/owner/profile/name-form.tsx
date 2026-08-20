'use client';

import { useActionState, useState } from 'react';
import { saveOwnName, type FormState } from '@/app/actions';
import { FormField } from '@/components/form-field';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

/**
 * Своё имя.
 *
 * До сих пор оно было на этой странице текстом — тем же серым, что
 * телефон и роль, — и опечатка, сделанная при регистрации, оставалась
 * навсегда: в ленте, на смене, в зарплатах. Механизм правки существовал
 * всё это время, но только для приложения.
 *
 * Кнопка ведёт себя как в строках услуг и филиалов: пока править нечего,
 * её не видно, но место под неё занято — поле не дёргается на первой же
 * набранной букве.
 */
export function NameForm({ name }: { name: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveOwnName, null);
  const [draft, setDraft] = useState(name);
  const dirty = draft.trim() !== name && draft.trim().length >= 2;

  return (
    <FormField id="profile-name" label={t.settings.name} error={state?.error}>
      <form
        action={action}
        onSubmit={(e) => {
          if (pending) e.preventDefault();
        }}
        className="row-edit items-center"
      >
        <input
          id="profile-name"
          className="field field-sm min-w-0 flex-1"
          name="name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          minLength={2}
          required
        />
        <LoadingButton
          className={`btn-inline btn-inline-primary ${dirty ? '' : 'invisible'}`}
          busy={pending}
          label={t.settings.save}
          busyLabel={t.common.saving}
        />
      </form>
    </FormField>
  );
}
