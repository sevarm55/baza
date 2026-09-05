'use client';

import { useActionState } from 'react';

import { AuthButton, AuthError, AuthField, AuthHead } from '@/components/landing/auth-ui';
import { useT } from '@/lib/i18n/client';
import { BackToApp } from '../back-to-app';
import { resetAction, type LinkState } from '../actions';

/**
 * Два поля вместо одного.
 *
 * Пароль набирают вслепую, и здесь его набирают в последний раз перед
 * тем, как он станет единственным ключом: опечатка в этот момент
 * означает второй заход в почту. Повтор её ловит.
 */
export function ResetForm({ token, email }: { token: string; email: string }) {
  const t = useT();
  const [state, action, pending] = useActionState<LinkState, FormData>(resetAction, null);

  /* Пароль сохранён, а человек пришёл из приложения: показываем дорогу
     назад вместо формы, которую уже некуда отправлять. */
  if (state?.app) return <BackToApp email={state.app} />;

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="token" value={token} />

      <AuthHead title={t.auth.newPassword} subtitle={email} />

      <AuthField
        label={t.auth.newPassword}
        hint={t.auth.passwordHint}
        name="password"
        type="password"
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        required
        invalid={Boolean(state?.error)}
      />

      <AuthField
        label={t.auth.confirmPassword}
        name="repeat"
        type="password"
        autoComplete="new-password"
        autoCapitalize="none"
        spellCheck={false}
        required
        invalid={Boolean(state?.error)}
      />

      <AuthError>{state?.error}</AuthError>

      <AuthButton type="submit" busy={pending} disabled={pending}>
        {pending ? t.auth.checking : t.auth.savePassword}
      </AuthButton>
    </form>
  );
}
