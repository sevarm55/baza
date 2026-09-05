'use client';

import { useActionState } from 'react';

import { AuthButton, AuthError, AuthHead } from '@/components/landing/auth-ui';
import { useT } from '@/lib/i18n/client';
import { BackToApp } from '../back-to-app';
import { confirmAction, type LinkState } from '../actions';

/** Кнопка, которая и гасит ссылку, и заводит бизнес. */
export function ConfirmForm({
  token,
  email,
  business,
}: {
  token: string;
  email: string;
  business: string;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<LinkState, FormData>(confirmAction, null);

  /* Мойка заведена, а человек пришёл из приложения: форму убираем совсем.
     Оставить её значило бы предложить нажать «Создать» второй раз по
     уже погашенной ссылке. */
  if (state?.app) return <BackToApp email={state.app} />;

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="token" value={token} />

      <AuthHead title={business} subtitle={t.auth.sentSub(email)} />

      <AuthError>{state?.error}</AuthError>

      <AuthButton type="submit" busy={pending} disabled={pending}>
        {pending ? t.auth.checking : t.auth.signUp}
      </AuthButton>
    </form>
  );
}
