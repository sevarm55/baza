'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { adminLoginAction } from '@/app/admin/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { useA } from '@/lib/i18n/admin/client';

/**
 * Вход владельца платформы: логин и пароль из окружения сервера.
 * Ошибка одна на оба поля: форма не подсказывает, какая половина не
 * подошла.
 */
export function AdminLoginForm() {
  const a = useA();
  const router = useRouter();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const res = await adminLoginAction({ login, password });
          if (res.ok) {
            router.replace('/admin');
            router.refresh();
            return;
          }
          setError(
            res.problem === 'THROTTLED'
              ? a.login.throttled(res.retryAfter ?? 60)
              : res.problem === 'NOT_CONFIGURED'
                ? a.login.notConfigured
                : a.login.denied,
          );
        });
      }}
    >
      <Field>
        <FieldLabel htmlFor="admin-login">{a.login.login}</FieldLabel>
        <Input
          id="admin-login"
          name="login"
          autoComplete="username"
          autoFocus
          required
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          aria-invalid={!!error}
          disabled={pending}
        />
      </Field>
      <Field>
        <FieldLabel htmlFor="admin-password">{a.login.password}</FieldLabel>
        <Input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={!!error}
          disabled={pending}
        />
      </Field>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || !login.trim() || !password}>
        {pending && <Spinner data-icon="inline-start" />}
        {a.login.signIn}
      </Button>
    </form>
  );
}
