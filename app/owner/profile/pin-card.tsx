'use client';

import { useActionState, useState } from 'react';
import { changePinAction, deletePinAction, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { ChangePinForm } from './change-pin-form';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';

/**
 * Код доступа в разделе «безопасность».
 *
 * Раньше форма смены стояла раскрытой всегда: на странице профиля
 * постоянно висели двенадцать пустых клеток. Пустой ряд клеток ничего не
 * показывает и ничего не спрашивает — он просто занимает место и
 * читается как сломанный или выключенный элемент, а не как то, что
 * можно сделать.
 *
 * Поэтому по умолчанию здесь строка: что это за код и от чего он.
 * Клетки приходят по нажатию — тогда, когда человек решил его менять.
 *
 * Действий три, а не два. «Создать» и «изменить» это одно и то же
 * действие с разным вопросом про текущий код; «удалить» появилось
 * потому, что код доступа необязателен, а убрать однажды заведённый до
 * сих пор было нельзя ничем. Запертым после удаления никто не остаётся:
 * вход по коду из SMS работает на любой номер.
 *
 * Состояние действия живёт здесь, а не в форме, хотя набирают код там.
 * Причина в том, кто закрывает форму: смена кода уводит на вход — сессии
 * погашены, включая эту, — а вот первая установка оставляет человека на
 * месте, и форма после неё обязана свернуться обратно в строку. Решение
 * «свернуться» принимает эта карточка, значит и состояние, по которому
 * оно принимается, должно быть её.
 */
export function PinCard({ hasPin }: { hasPin: boolean }) {
  const t = useT();
  const [open, setOpen] = useState<'none' | 'edit' | 'delete'>('none');
  const [state, action, pending] = useActionState<FormState, FormData>(changePinAction, null);

  /* Свернуть на удаче — по своему же состоянию, в своей же отрисовке.
     Эффектом было бы на кадр позже: человек увидел бы пустые клетки уже
     сделанного дела. Сверяем именно смену `state`, а не его удачность:
     иначе форма, открытая второй раз, схлопывалась бы сразу — прошлый
     успех никуда не девается. */
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
    <div className="setting-row">
      <span className="min-w-0">
        <span className="setting-row-label">{t.auth.pin}</span>
        <span className="setting-row-note">{t.profile.pinNote}</span>
      </span>

      {/* Удаление стоит рядом, а не отдельной строкой ниже: это то же
          самое дело, что и смена, только в другую сторону. Отдельная
          строка объявила бы его самостоятельным разделом настроек. */}
      <span className="flex flex-wrap items-center gap-2.5">
        {hasPin && (
          <button type="button" className="btn-inline-danger" onClick={() => setOpen('delete')}>
            {t.auth.deleteAccessCode}
          </button>
        )}
        <button type="button" className="btn-inline" onClick={() => setOpen('edit')}>
          {hasPin ? t.auth.changePin : t.auth.setPin}
        </button>
      </span>
    </div>
  );
}

/**
 * Подтверждение удаления: одно поле и последствие над кнопкой.
 *
 * Текущий код спрашиваем, как и при смене: телефон бывает разблокирован и
 * лежит на мойке, а «убрать вторую дверь» это ровно то действие, которое
 * посторонний рядом сделал бы первым.
 *
 * Своё состояние действия, отдельно от смены: удача здесь всегда уводит
 * на вход, и сворачивать обратно в строку нечего.
 */
function DeletePinForm({ onCancel }: { onCancel: () => void }) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(deletePinAction, null);

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-1">
        <span className="setting-row-label">{t.auth.deleteAccessCodeAsk}</span>
        <span className="setting-row-note">{t.auth.deleteAccessCodeNote}</span>
      </div>

      <CodeInput
        name="current"
        length={PIN_LENGTH}
        /* Четыре — у всех, кто завёл код до перехода на шесть. Здесь он
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

      {state?.error && <p className="alert">{state.error}</p>}

      <div className="flex flex-wrap items-center gap-2.5">
        <button type="button" className="btn-inline" onClick={onCancel}>
          {t.common.cancel}
        </button>
        <button className="btn btn-auto btn-ghost text-bad" disabled={pending}>
          {pending ? t.common.loading : t.auth.deleteAccessCode}
        </button>
      </div>
    </form>
  );
}
