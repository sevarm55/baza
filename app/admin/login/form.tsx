'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { adminLoginStartAction, adminLoginVerifyAction } from '@/app/admin/actions';
import { CodeInput } from '@/components/code-input';
import { PhoneField } from '@/components/phone-field';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { useA } from '@/lib/i18n/admin/client';
import { useT } from '@/lib/i18n/client';
import { normalizePhone } from '@/lib/phone';

type Step = { kind: 'pin' } | { kind: 'code'; challengeId: string; phoneMasked: string };

/**
 * Два шага: телефон с PIN, затем код из SMS. Оба обязательны всегда.
 * Ошибки возвращаются словами, а не кодами: админ тоже человек.
 */
export function AdminLoginForm() {
  const a = useA();
  const t = useT();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'pin' });
  const [phone, setPhone] = useState({ nsn: '', country: 'AM' });
  const [pin, setPin] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submitPin = () => {
    setError(null);
    start(async () => {
      const res = await adminLoginStartAction({ phone: normalizePhone(phone.nsn, phone.country), pin });
      if (res.ok) {
        setStep({ kind: 'code', challengeId: res.challengeId, phoneMasked: res.phoneMasked });
        setCode('');
        return;
      }
      setError(
        res.problem === 'THROTTLED'
          ? a.login.throttled(res.retryAfter ?? 60)
          : res.problem === 'SMS_FAILED'
            ? a.login.smsFailed
            : a.login.denied,
      );
    });
  };

  const submitCode = (value: string) => {
    if (step.kind !== 'code') return;
    setError(null);
    start(async () => {
      const res = await adminLoginVerifyAction({ challengeId: step.challengeId, code: value });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }
      if (res.problem === 'EXPIRED' || res.problem === 'TOO_MANY_TRIES' || res.problem === 'DENIED') {
        setStep({ kind: 'pin' });
        setPin('');
        setError(res.problem === 'EXPIRED' ? a.login.codeExpired : res.problem === 'TOO_MANY_TRIES' ? a.login.codeTooMany : a.login.denied);
        return;
      }
      setError(a.login.codeInvalid);
      setCode('');
    });
  };

  if (step.kind === 'code') {
    return (
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submitCode(code);
        }}
      >
        <div>
          <div className="text-sm font-semibold">{a.login.codeTitle}</div>
          <p className="num mt-0.5 text-xs text-muted-foreground">{a.login.codeLead(step.phoneMasked)}</p>
        </div>
        <CodeInput
          name="code"
          label={a.login.code}
          autoFocus
          value={code}
          onChange={setCode}
          onComplete={submitCode}
          invalid={!!error}
          disabled={pending}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" disabled={pending || code.length < 6}>
          {pending && <Spinner data-icon="inline-start" />}
          {a.login.verify}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setStep({ kind: 'pin' })} disabled={pending}>
          {a.login.back}
        </Button>
      </form>
    );
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submitPin();
      }}
    >
      <PhoneField
        label={a.login.phone}
        countryLabel={t.auth.country}
        autoFocus
        onChange={(nsn, country) => setPhone({ nsn, country })}
        invalid={!!error}
      />
      <CodeInput
        name="pin"
        label={a.login.pin}
        autoComplete="current-password"
        revealable
        value={pin}
        onChange={setPin}
        invalid={!!error}
        disabled={pending}
      />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending || pin.length < 6 || phone.nsn.length < 6}>
        {pending && <Spinner data-icon="inline-start" />}
        {a.login.next}
      </Button>
    </form>
  );
}
