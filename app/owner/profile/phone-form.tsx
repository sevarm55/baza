'use client';

import { useActionState, useState } from 'react';

import { saveOwnPhone, type FormState } from '@/app/actions';
import { LoadingButton } from '@/components/loading';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Свой телефон.
 *
 * Обычное поле, без кода и без подтверждения. Раньше здесь стояли две
 * панели: «подтвердите номер» и «сменить номер», обе через SMS. Первая
 * существовала ради восстановления по SMS, второй нечем подтверждать —
 * кодов у продукта больше нет. Владелец входит почтой, телефон у него
 * связь, а не ключ.
 *
 * Кнопка ведёт себя как в соседнем поле имени: пока править нечего, её
 * не видно, но место под неё занято, и поле не дёргается на первой же
 * набранной цифре.
 */
export function PhoneForm({ phone }: { phone: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveOwnPhone, null);
  const [draft, setDraft] = useState(phone);
  const dirty = draft.trim() !== phone;

  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <Field>
        <FieldLabel htmlFor="profile-phone">{t.profile.phone}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="profile-phone"
            name="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-w-0 flex-1"
          />
          <LoadingButton
            busy={pending}
            label={t.settings.save}
            busyLabel={t.common.saving}
            className={cn(!dirty && !pending && 'invisible max-md:hidden')}
          />
        </div>
        <FieldDescription>{t.auth.changePhoneNote}</FieldDescription>
        <FieldError>{state?.error}</FieldError>
      </Field>
    </form>
  );
}
