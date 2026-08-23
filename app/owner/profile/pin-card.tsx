'use client';

import { useActionState, useState } from 'react';

import { changePinAction, deletePinAction, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import { ChangePinForm } from './change-pin-form';

/**
 * Код доступа в разделе «безопасность».
 *
 * По умолчанию строка: что это за код и от чего он. Клетки приходят по
 * нажатию, когда человек решил его менять. Действий три: создать и
 * изменить это одно действие с разным вопросом про текущий код, а
 * удалить появилось потому, что код необязателен.
 *
 * Состояние действия живёт здесь, а не в форме: смена кода уводит на
 * вход, а первая установка оставляет человека на месте, и форма после
 * неё обязана свернуться обратно в строку. Решение принимает карточка,
 * значит и состояние её.
 */
export function PinCard({ hasPin }: { hasPin: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<'none' | 'edit' | 'delete'>('none');
  const [state, action, pending] = useActionState<FormState, FormData>(changePinAction, null);

  /* Свернуть на удаче в своей же отрисовке, сверяя именно смену
     `state`: иначе форма, открытая второй раз, схлопывалась бы сразу,
     прошлый успех никуда не девается. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen('none');
  }

  if (open === 'edit') {
    return (
      <ChangePinForm
        hasPin={hasPin}
        state={state}
        action={action}
        pending={pending}
        onCancel={() => setOpen('none')}
      />
    );
  }

  if (open === 'delete') {
    return <DeletePinForm onCancel={() => setOpen('none')} />;
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {t.auth.pin}
          {hasPin && <StatusBadge tone="neutral">{t.settings.pinHidden}</StatusBadge>}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.profile.pinNote}</p>
      </div>

      {/* Удаление стоит рядом, а не отдельной строкой: это то же дело,
          что и смена, только в другую сторону. */}
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="xs" onClick={() => setOpen('edit')}>
          {hasPin ? t.auth.changePin : t.auth.setPin}
        </Button>
        {hasPin && (
          <Button type="button" variant="destructive-soft" size="xs" onClick={() => setOpen('delete')}>
            {t.auth.deleteAccessCode}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Подтверждение удаления: одно поле и последствие над кнопкой.
 *
 * Текущий код спрашиваем, как и при смене: телефон бывает разблокирован
 * и лежит на мойке. Своё состояние действия, отдельно от смены: удача
 * здесь всегда уводит на вход, и сворачивать обратно в строку нечего.
 */
function DeletePinForm({ onCancel }: { onCancel: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(deletePinAction, null);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div>
        <p className="text-sm font-medium">{t.auth.deleteAccessCodeAsk}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.auth.deleteAccessCodeNote}</p>
      </div>

      <CodeInput
        name="current"
        length={PIN_LENGTH}
        /* Четыре у всех, кто завёл код до перехода на шесть: здесь он
           сверяется, а не создаётся. */
        minLength={4}
        label={t.auth.currentPin}
        title={t.auth.currentPin}
        autoComplete="current-password"
        autoFocus
        revealable
        revealLabel={t.auth.showCode}
        hideLabel={t.auth.hideCode}
        enteredLabel={t.auth.entered}
        invalid={Boolean(state?.error)}
      />

      {state?.error && <FormMessage>{state.error}</FormMessage>}

      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton
          variant="destructive"
          size="sm"
          busy={pending}
          label={t.auth.deleteAccessCode}
          busyLabel={t.common.deleting}
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
