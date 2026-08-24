'use client';

import { useState } from 'react';

import { type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { Button } from '@/components/ui/button';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';
import { autoFocusOnDesktop } from '@/lib/autofocus';

/**
 * Смена PIN: текущий, новый и повтор нового.
 *
 * Повтор сервер не спрашивает: он проверяется здесь, до отправки.
 * Удачная смена гасит все сессии, включая эту, и опечатка в
 * единственном поле «новый» означала бы выход из всех устройств с
 * кодом, которого человек не знает.
 *
 * Состояние действия приходит сверху: сворачивает форму родитель, и
 * решать это он должен по своему состоянию (см. pin-card.tsx).
 */
export function ChangePinForm({
  hasPin = true,
  state,
  action,
  pending,
  onCancel,
}: {
  hasPin?: boolean;
  state: FormState;
  action: (formData: FormData) => void;
  pending: boolean;
  /** свернуть форму обратно в строку «PIN-код» */
  onCancel?: () => void;
}) {
  const t = useT();

  /* Новый и повтор под нашим присмотром: их надо сравнить. Текущий
     остаётся обычным неуправляемым полем. */
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  /* Пока повтор короче нового, молчим: ругаться на второй цифре из
     шести значит ругаться на человека, который ещё печатает. */
  const diverged = repeat.length >= next.length && repeat.length > 0 && next !== repeat;
  const error = state?.error ?? (mismatch || diverged ? t.auth.pinMismatch : null);

  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        if (next !== repeat) {
          /* Отправку останавливаем здесь: `action` сработал бы сразу
             после обработчика и унёс бы на сервер код с опечаткой. */
          e.preventDefault();
          setMismatch(true);
        }
      }}
    >
      <div className={hasPin ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
        {/* Текущий код спрашивается, только если он есть: у заведённых
            по коду из SMS его нет вовсе. */}
        {hasPin && (
          <CodeInput
            name="current"
            length={PIN_LENGTH}
            /* Текущий код у старых аккаунтов четырёхзначный: здесь он
               сверяется, а не создаётся. Новый ниже строго шесть. */
            minLength={4}
            label={t.auth.currentPin}
            title={t.auth.currentPin}
            autoComplete="current-password"
            autoFocus={autoFocusOnDesktop()}
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
          autoFocus={!hasPin && autoFocusOnDesktop()}
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

      {/* Предупреждение о выходе всех устройств стоит до кнопки: это
          последствие, а не сноска. */}
      <p className="text-xs text-muted-foreground">{hasPin ? t.auth.pinChangedNote : t.auth.setPinNote}</p>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton
          size="sm"
          busy={pending}
          label={hasPin ? t.auth.resetSave : t.auth.setPin}
          busyLabel={t.common.saving}
        />
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t.common.cancel}
          </Button>
        )}
      </div>
    </form>
  );
}
