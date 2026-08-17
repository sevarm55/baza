'use client';

import { useActionState, useState } from 'react';
import { changePinAction, type FormState } from '@/app/actions';
import { ChangePinForm } from './change-pin-form';
import { useT } from '@/lib/i18n/client';

/**
 * PIN в разделе «безопасность».
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
 * Состояние действия живёт здесь, а не в форме, хотя набирают код там.
 * Причина в том, кто закрывает форму: смена кода уводит на вход — сессии
 * погашены, включая эту, — а вот первая установка оставляет человека на
 * месте, и форма после неё обязана свернуться обратно в строку. Решение
 * «свернуться» принимает эта карточка, значит и состояние, по которому
 * оно принимается, должно быть её. Пока состояние жило в форме, она
 * звала родительский `onCancel` прямо в отрисовке — запрещённое
 * обновление чужого компонента во время рендера, и React ругался в
 * консоль на каждой установке кода.
 */
export function PinCard({ hasPin }: { hasPin: boolean }) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(changePinAction, null);

  /* Свернуть на удаче — по своему же состоянию, в своей же отрисовке.
     Эффектом было бы на кадр позже: человек увидел бы пустые клетки уже
     сделанного дела. Сверяем именно смену `state`, а не его удачность:
     иначе форма, открытая второй раз, схлопывалась бы сразу — прошлый
     успех никуда не девается. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setEditing(false);
  }

  if (editing) {
    return (
      <ChangePinForm
        hasPin={hasPin}
        state={state}
        action={action}
        pending={pending}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="setting-row">
      <span className="min-w-0">
        <span className="setting-row-label">{t.auth.pin}</span>
        <span className="setting-row-note">{t.profile.pinNote}</span>
      </span>
      <button type="button" className="btn-inline" onClick={() => setEditing(true)}>
        {hasPin ? t.auth.changePin : t.auth.setPin}
      </button>
    </div>
  );
}
