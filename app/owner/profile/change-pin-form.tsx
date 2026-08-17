'use client';

import { useState } from 'react';
import { type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';

/**
 * Смена PIN.
 *
 * Три шага, а не два: текущий, новый и повтор нового.
 *
 * Повтор сервер не спрашивает и знать о нём не должен — он проверяется
 * здесь, до отправки. Причина в последствии: удачная смена гасит все
 * сессии, включая эту. Опечатка в единственном поле «новый» означала бы
 * выход из всех устройств с кодом, которого человек не знает, — то есть
 * потерю кабинета до восстановления по SMS. Второе поле стоит одного
 * лишнего движения раз в год.
 *
 * Ошибка — одна на всю форму, а не своя под каждой клеткой: клетки
 * набирают как одно поле, и шесть отдельных сообщений под одним рядом
 * читаются как шесть разных поломок.
 *
 * Клетки те же, что на входе, и это не украшательство: код набирают в
 * одном виде и вводят в другом ровно до первой ошибки. Одинаковое поле
 * в обоих местах — самая дешёвая правильная подсказка.
 */
export function ChangePinForm({
  hasPin = true,
  state,
  action,
  pending,
  onCancel,
}: {
  hasPin?: boolean;
  /**
   * Состояние действия приходит сверху, а не заводится здесь.
   *
   * Успешная первая установка обязана свернуть форму обратно в строку —
   * иначе на странице остаётся раскрытый ряд пустых клеток от уже
   * сделанного дела. Но сворачивает форму родитель, и решать это он
   * должен по своему состоянию: пока `useActionState` жил здесь, форма
   * дёргала родительский `onCancel` прямо в отрисовке, а это запрещённое
   * обновление чужого компонента во время рендера — React ругался в
   * консоль на каждой установке кода.
   */
  state: FormState;
  action: (formData: FormData) => void;
  pending: boolean;
  /** свернуть форму обратно в строку «PIN-код» */
  onCancel?: () => void;
}) {
  const t = useT();

  /* Новый и повтор — под нашим присмотром: их надо сравнить. Текущий
     остаётся обычным неуправляемым полем, сравнивать его не с чем. */
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  /* Расходятся ли уже набранные части. Пока повтор короче нового,
     молчим: ругаться на второй цифре из шести значит ругаться на
     человека, который ещё печатает. */
  const diverged = repeat.length >= next.length && repeat.length > 0 && next !== repeat;
  const error = state?.error ?? (mismatch || diverged ? t.auth.pinMismatch : null);

  return (
    <form
      action={action}
      className="grid gap-4"
      onSubmit={(e) => {
        if (next !== repeat) {
          /* Отправку останавливаем здесь: `action` сработал бы прямо
             после этого обработчика и унёс бы на сервер код с
             опечаткой. */
          e.preventDefault();
          setMismatch(true);
        }
      }}
    >
      <div className={hasPin ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
        {/* Текущий код спрашивается, только если он есть. У тех, кто
            завёл мойку по коду из SMS, его нет вовсе, и пустое поле
            «введите текущий» было бы тупиком. */}
        {hasPin && (
          <CodeInput
            name="current"
            length={PIN_LENGTH}
            /* Текущий код у старых аккаунтов четырёхзначный: здесь он
               сверяется, а не создаётся. Новый ниже — строго шесть. */
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
        )}

        <CodeInput
          name="next"
          length={PIN_LENGTH}
          label={t.auth.newPin}
          title={`${t.auth.newPin} · ${t.auth.pinHint}`}
          autoComplete="new-password"
          autoFocus={!hasPin}
          revealable
          value={next}
          onChange={(v) => {
            setNext(v);
            setMismatch(false);
          }}
          revealLabel={t.auth.showCode}
          hideLabel={t.auth.hideCode}
          enteredLabel={t.auth.entered}
          invalid={Boolean(state?.error)}
        />

        <CodeInput
          name="confirm"
          length={PIN_LENGTH}
          label={t.auth.confirmPin}
          title={t.auth.confirmPin}
          autoComplete="new-password"
          revealable
          value={repeat}
          onChange={(v) => {
            setRepeat(v);
            setMismatch(false);
          }}
          revealLabel={t.auth.showCode}
          hideLabel={t.auth.hideCode}
          enteredLabel={t.auth.entered}
          invalid={mismatch || diverged}
        />
      </div>

      {/* Предупреждение о выходе всех устройств стоит ДО кнопки — это
          последствие, а не сноска. */}
      <p className="note">{hasPin ? t.auth.pinChangedNote : t.auth.setPinNote}</p>

      {error && <p className="alert">{error}</p>}

      <div className="flex flex-wrap items-center gap-2.5">
        {onCancel && (
          <button type="button" className="btn-inline" onClick={onCancel}>
            {t.common.cancel}
          </button>
        )}
        <button className="btn btn-auto" disabled={pending}>
          {pending ? t.common.loading : hasPin ? t.auth.resetSave : t.auth.setPin}
        </button>
      </div>
    </form>
  );
}
