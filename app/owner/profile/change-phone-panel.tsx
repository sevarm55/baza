'use client';

import { useActionState, useState } from 'react';

import { changePhoneAction, type ChangePhoneState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { PhoneField } from '@/components/phone-field';
import { SignOutButton } from '@/components/sign-out-button';
import { Button } from '@/components/ui/button';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';

/**
 * Смена своего номера.
 *
 * Свёрнута в строку, как и PIN рядом: номер меняют раз в жизни. Шагов
 * до трёх, и первый появляется не у всех: тому, у кого есть PIN,
 * доказывать себя кодом не нужно. Кто заводился по SMS, сначала
 * подтверждает старый номер.
 *
 * Последний шаг гасит все сессии, включая эту. Поэтому «готово» здесь
 * не галочка на секунду, а строка про то, что войти придётся заново, и
 * кнопка выхода.
 */
export function ChangePhonePanel({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<ChangePhoneState, FormData>(
    changePhoneAction,
    null,
  );
  const t = useT();
  const [open, setOpen] = useState(false);

  /* Строка с кнопкой, пока не начали. Отказ нулевого шага показывается
     здесь же: он случился до того, как форма раскрылась. */
  if (!open || state?.step === 'idle') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="text-sm font-medium">{t.auth.changePhone}</div>
            <p className="mt-0.5 text-xs text-muted-foreground">{t.auth.changePhoneNote}</p>
          </div>
          {hasPin ? (
            <Button type="button" variant="outline" size="xs" onClick={() => setOpen(true)}>
              {t.common.edit}
            </Button>
          ) : (
            /* Без PIN первое нажатие уже отправляет SMS: это форма, а не
               переключатель. */
            <form
              action={action}
              onSubmit={(e) => {
                if (pending) e.preventDefault();
              }}
            >
              <LoadingButton
                variant="outline"
                size="xs"
                busy={pending}
                label={t.common.edit}
                busyLabel={t.auth.sending}
                onClick={() => setOpen(true)}
              />
            </form>
          )}
        </div>
        {state?.step === 'idle' && state.error && <FormMessage>{state.error}</FormMessage>}
      </div>
    );
  }

  if (state?.step === 'done') {
    return (
      /* Сессия уже мертва, и любая ссылка уводит на вход без объяснений;
         выход своей кнопкой единственный способ уйти осознанно и стереть
         протухший cookie. */
      <div className="flex flex-col items-start gap-2">
        <FormMessage tone="success">{t.auth.changePhoneDone}</FormMessage>
        <p className="text-xs text-muted-foreground">{t.auth.changePhoneDoneNote}</p>
        <SignOutButton labelled variant="outline" />
      </div>
    );
  }

  /* Шаг последний: код с НОВОГО номера. */
  if (state?.step === 'code') {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <input type="hidden" name="shown" value={state.phone} />
        <p className="text-sm text-muted-foreground">{t.auth.otpSent(state.phone)}</p>

        <CodeInput
          name="code"
          length={CODE_LENGTH}
          label={t.auth.otpGroup(CODE_LENGTH)}
          title={t.auth.otpCode}
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          enteredLabel={t.auth.entered}
          invalid={Boolean(state.error)}
        />

        {state.error && <FormMessage>{state.error}</FormMessage>}

        <Foot pending={pending} label={t.auth.otpVerify} onCancel={() => setOpen(false)} />
      </form>
    );
  }

  /* Нулевой шаг: код на СВОЙ номер, только у кого нет PIN. */
  if (state?.step === 'proof') {
    return (
      <form action={action} className="flex flex-col gap-4">
        <input type="hidden" name="proofId" value={state.proofId} />
        <div>
          <p className="text-sm font-medium">{t.auth.changePhoneProof}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{t.auth.otpSent(state.phone)}</p>
        </div>

        <CodeInput
          name="proofCode"
          length={CODE_LENGTH}
          label={t.auth.otpGroup(CODE_LENGTH)}
          title={t.auth.otpCode}
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          enteredLabel={t.auth.entered}
          invalid={Boolean(state.error)}
        />

        {state.error && <FormMessage>{state.error}</FormMessage>}

        <Foot pending={pending} label={t.common.next} onCancel={() => setOpen(false)} />
      </form>
    );
  }

  /* Шаг первый: новый номер. Доказательство едет скрытыми полями: код
     на свой номер проверяется один раз, вместе с новым номером. */
  const proof = state?.step === 'phone' ? state : null;

  return (
    <form action={action} className="flex flex-col gap-4">
      {proof?.proofId && <input type="hidden" name="proofId" value={proof.proofId} />}
      {proof?.proofCode && <input type="hidden" name="proofCode" value={proof.proofCode} />}

      <PhoneField
        name="phone"
        label={t.auth.changePhoneNew}
        countryLabel={t.auth.country}
        autoComplete="tel"
        autoFocus
        invalid={Boolean(proof?.error)}
      />

      {/* PIN только у тех, у кого он есть: остальные себя уже доказали
          кодом выше. */}
      {hasPin && (
        <CodeInput
          name="pin"
          length={PIN_LENGTH}
          minLength={4}
          label={t.auth.pin}
          title={t.auth.pin}
          autoComplete="current-password"
          revealable
          revealLabel={t.auth.showCode}
          hideLabel={t.auth.hideCode}
          enteredLabel={t.auth.entered}
          invalid={Boolean(proof?.error)}
        />
      )}

      {proof?.error && <FormMessage>{proof.error}</FormMessage>}

      <Foot pending={pending} label={t.auth.resetSend} onCancel={() => setOpen(false)} />
    </form>
  );
}

/** Действие и отмена одной высоты, как в остальных формах профиля. */
function Foot({
  pending,
  label,
  onCancel,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LoadingButton size="sm" busy={pending} label={label} busyLabel={t.auth.checking} />
      <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
        {t.common.cancel}
      </Button>
    </div>
  );
}
