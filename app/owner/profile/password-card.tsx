'use client';

import { useActionState, useState } from 'react';

import { changePasswordAction, type FormState } from '@/app/actions';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { PasswordField } from '@/components/patterns/password-field';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { autoFocusOnDesktop } from '@/lib/autofocus';

/**
 * Пароль в разделе «безопасность».
 *
 * По умолчанию строка: чем закрыт вход. Поля приходят по нажатию, когда
 * человек решил пароль менять.
 *
 * Раньше здесь стоял ПИН — шесть цифр в клетках. Вход по нему выключен
 * с переходом на почту и пароль, но карточка осталась и продолжала
 * менять то, чем уже нельзя войти: человек добросовестно набирал новый
 * код, получал «сохранено» и ничего этим не менял.
 *
 * Действие одно. Прежние три (создать, изменить, удалить) были у ПИНа
 * оттого, что он был необязателен; пароль обязателен всегда, удалять
 * его значило бы запереть себя снаружи.
 */
export function PasswordCard() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState<FormState, FormData>(changePasswordAction, null);

  if (open) return <ChangePasswordForm state={state} action={action} pending={pending} onCancel={() => setOpen(false)} />;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-medium">
          {t.auth.passwordLabel}
          <StatusBadge tone="neutral">{t.settings.pinHidden}</StatusBadge>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t.profile.passwordNote}</p>
      </div>

      <Button type="button" variant="outline" size="xs" className="shrink-0" onClick={() => setOpen(true)}>
        {t.auth.changePassword}
      </Button>
    </div>
  );
}

/**
 * Текущий, новый и повтор нового.
 *
 * Повтор сервер не спрашивает: он проверяется здесь, до отправки.
 * Удачная смена гасит все сессии, включая эту, и опечатка в
 * единственном поле «новый» означала бы выход из всех устройств с
 * паролем, которого человек не знает.
 */
function ChangePasswordForm({
  state,
  action,
  pending,
  onCancel,
}: {
  state: FormState;
  action: (formData: FormData) => void;
  pending: boolean;
  onCancel: () => void;
}) {
  const t = useT();

  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [mismatch, setMismatch] = useState(false);

  /* Пока повтор короче нового, молчим: ругаться на втором знаке значит
     ругаться на человека, который ещё печатает. */
  const diverged = repeat.length >= next.length && repeat.length > 0 && next !== repeat;
  const error = state?.error ?? (mismatch || diverged ? t.auth.passwordMismatch : null);

  return (
    <form
      action={action}
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        if (next !== repeat) {
          /* Отправку останавливаем здесь: `action` сработал бы сразу
             после обработчика и унёс бы на сервер пароль с опечаткой. */
          e.preventDefault();
          setMismatch(true);
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <PasswordField
          name="current"
          label={t.auth.currentPassword}
          autoComplete="current-password"
          autoFocus={autoFocusOnDesktop()}
          invalid={Boolean(state?.error)}
        />

        <PasswordField
          name="next"
          label={t.auth.newPassword}
          hint={t.auth.passwordHint}
          autoComplete="new-password"
          invalid={Boolean(state?.error)}
          value={next}
          onChange={(v) => {
            setNext(v);
            setMismatch(false);
          }}
        />

        <PasswordField
          name="confirm"
          label={t.auth.confirmPassword}
          autoComplete="new-password"
          invalid={mismatch || diverged}
          value={repeat}
          onChange={(v) => {
            setRepeat(v);
            setMismatch(false);
          }}
        />
      </div>

      {/* Предупреждение о выходе всех устройств стоит до кнопки: это
          последствие, а не сноска. */}
      <p className="text-xs text-muted-foreground">{t.auth.passwordChangedNote}</p>

      {error && <FormMessage>{error}</FormMessage>}

      <div className="flex flex-wrap items-center gap-2">
        <LoadingButton size="sm" busy={pending} label={t.auth.savePassword} busyLabel={t.common.saving} />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          {t.common.cancel}
        </Button>
      </div>
    </form>
  );
}
