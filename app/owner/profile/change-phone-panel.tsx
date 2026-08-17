'use client';

import { useActionState, useState } from 'react';
import { changePhoneAction, type ChangePhoneState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PhoneField } from '@/components/phone-field';
import { IconCheck } from '@/components/icons';
import { SignOutButton } from '@/components/sign-out-button';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { PIN_LENGTH } from '@/lib/phone';
import { useT } from '@/lib/i18n/client';

/**
 * Смена своего номера.
 *
 * Свёрнута в строку, как и PIN рядом: номер меняют раз в жизни, и
 * держать ради этого раскрытую форму на странице, где всё остальное
 * читают каждый день, незачем.
 *
 * Шагов до трёх, и первый появляется не у всех: тому, у кого есть PIN,
 * доказывать себя кодом не нужно — он вводит PIN на том же экране, где
 * называет новый номер. Кто заводился по SMS, сначала подтверждает
 * старый номер: PIN-а у него нет, и без этого шага сменить номер он не
 * смог бы никогда.
 *
 * Последний шаг гасит все сессии, включая эту. Поэтому «готово» здесь не
 * зелёная галочка на секунду, а строка про то, что войти придётся
 * заново: человек, у которого страница молча перестала работать, решит,
 * что сломали мы.
 */
export function ChangePhonePanel({ hasPin }: { hasPin: boolean }) {
  const [state, action, pending] = useActionState<ChangePhoneState, FormData>(
    changePhoneAction,
    null,
  );
  const t = useT();
  const [open, setOpen] = useState(false);

  /* Строка «Телефон» с кнопкой — пока не начали. Отказ нулевого шага
     показывается здесь же: он случился до того, как форма раскрылась. */
  if (!open || state?.step === 'idle') {
    return (
      <div className="grid gap-2.5">
        <div className="setting-row">
          <span className="min-w-0">
            <span className="setting-row-label">{t.auth.changePhone}</span>
            <span className="setting-row-note">{t.auth.changePhoneNote}</span>
          </span>
          {hasPin ? (
            <button
              type="button"
              className="btn-inline"
              onClick={() => {
                setOpen(true);
              }}
            >
              {t.common.edit}
            </button>
          ) : (
            /* Без PIN первое нажатие уже отправляет SMS — значит это
               форма, а не переключатель: иначе кнопка «изменить»
               молча слала бы код. */
            <form action={action}>
              <button className="btn-inline" disabled={pending} onClick={() => setOpen(true)}>
                {pending ? t.auth.sending : t.common.edit}
              </button>
            </form>
          )}
        </div>
        {state?.step === 'idle' && state.error && <p className="alert">{state.error}</p>}
      </div>
    );
  }

  if (state?.step === 'done') {
    return (
      /* Дверь наружу здесь обязательна. Сессия уже мертва, и любая
         ссылка на странице уводит на экран входа без объяснений; выход
         своей кнопкой — единственный способ уйти отсюда осознанно и
         заодно стереть протухший cookie. */
      <div className="grid justify-items-start gap-2.5">
        <p className="hint-good">
          <IconCheck width={16} height={16} />
          {t.auth.changePhoneDone}
        </p>
        <p className="note">{t.auth.changePhoneDoneNote}</p>
        <SignOutButton labelled />
      </div>
    );
  }

  /* Шаг последний: код с НОВОГО номера. */
  if (state?.step === 'code') {
    return (
      <form action={action} className="grid gap-3.5">
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <input type="hidden" name="shown" value={state.phone} />
        <p className="text-[13.5px] text-muted">{t.auth.otpSent(state.phone)}</p>

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

        {state.error && <p className="alert">{state.error}</p>}

        <Foot pending={pending} label={t.auth.otpVerify} onCancel={() => setOpen(false)} t={t} />
      </form>
    );
  }

  /* Нулевой шаг: код на СВОЙ номер — только у кого нет PIN. */
  if (state?.step === 'proof') {
    return (
      <form action={action} className="grid gap-3.5">
        <input type="hidden" name="proofId" value={state.proofId} />
        <p className="text-[13.5px] font-semibold">{t.auth.changePhoneProof}</p>
        <p className="text-[13.5px] text-muted">{t.auth.otpSent(state.phone)}</p>

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

        {state.error && <p className="alert">{state.error}</p>}

        <Foot pending={pending} label={t.common.next} onCancel={() => setOpen(false)} t={t} />
      </form>
    );
  }

  /* Шаг первый: новый номер. Доказательство едет скрытыми полями — код
     на свой номер проверяется один раз, вместе с новым номером. */
  const proof = state?.step === 'phone' ? state : null;

  return (
    <form action={action} className="grid gap-3.5">
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

      {/* PIN — только у тех, у кого он есть. У остальных себя уже
          доказали кодом выше. */}
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

      {proof?.error && <p className="alert">{proof.error}</p>}

      <Foot pending={pending} label={t.auth.resetSend} onCancel={() => setOpen(false)} t={t} />
    </form>
  );
}

/** Отмена и действие — одинаковой высоты, как в остальных формах профиля. */
function Foot({
  pending,
  label,
  onCancel,
  t,
}: {
  pending: boolean;
  label: string;
  onCancel: () => void;
  t: ReturnType<typeof useT>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" className="btn-inline" onClick={onCancel}>
        {t.common.cancel}
      </button>
      <button className="btn btn-auto" disabled={pending}>
        {pending ? t.common.loading : label}
      </button>
    </div>
  );
}
