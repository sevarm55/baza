'use client';

import { useActionState, useEffect, useState } from 'react';
import { authAction, type AuthState } from '@/app/auth-actions';
import { resumeSavedAccount, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PhoneField } from '@/components/phone-field';
import { IconBack, IconCheck } from '@/components/icons';
import { personColor } from '@/lib/person-color';
import { PIN_LENGTH } from '@/lib/phone';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import type { RememberedWebAccount } from '@/lib/auth';
import s from './auth-surface.module.css';

/**
 * Форма входа и регистрации целиком.
 *
 * Одна на все места, где человек авторизуется: окно поверх лендинга,
 * страница `/login`, страница `/start/:niche`. Разница между ними
 * визуальная и остаётся снаружи — здесь только сам разговор.
 *
 * Разговор ведёт одно серверное действие и один `useActionState`. Шаг
 * приходит с сервера: браузер не решает, показать ли экран кода из SMS,
 * — это решение принято там, где известно, знакомое ли устройство.
 *
 * Переключение «Вход / Регистрация» сбрасывает разговор целиком, и это
 * сделано ключом на компоненте, а не разбором состояния: у React нет
 * способа обнулить `useActionState`, а недосброшенная форма показала бы
 * ошибку входа над полями регистрации.
 */
export function AuthSurface({
  mode = 'signIn',
  niche,
  remembered = null,
  trialDays,
}: {
  mode?: 'signIn' | 'register';
  niche: string;
  remembered?: RememberedWebAccount | null;
  trialDays: number;
}) {
  /* Дверей две, но не равных. Главная — телефон и код из SMS: ею
     входят владельцы, и ею же регистрируются, потому что после кода эти
     два случая перестают различаться. Вторая — телефон и PIN: ею входят
     мойщики, которым аккаунт завёл владелец, и она же остаётся, когда
     SMS не идёт. Показывать их вкладками значило бы соврать о том, как
     продуктом пользуются. */
  const [door, setDoor] = useState<'sms' | 'pin'>(mode === 'register' ? 'sms' : 'sms');
  const [forgot, setForgot] = useState(false);

  /* Язык берётся из общего контекста продукта, а не из своего состояния.
     Своя локализация у окна входа была, пока общей не существовало;
     теперь две системы означали бы две куки и два переключателя, которые
     разъедутся на первой правке. */
  const t = useT();

  return (
    <div className={s.surface}>
      <Conversation
        /* Ключ обнуляет разговор при смене вкладки и при уходе в
           восстановление: другого способа сбросить useActionState нет. */
        key={`${door}:${forgot}`}
        door={door}
        forgot={forgot}
        niche={niche}
        remembered={remembered}
        t={t}
        trialDays={trialDays}
        onForgot={() => setForgot(true)}
        onBack={() => setForgot(false)}
        onDoor={(next) => {
          setDoor(next);
          setForgot(false);
        }}
      />

    </div>
  );
}

function Conversation({
  door,
  forgot,
  niche,
  remembered,
  t,
  trialDays,
  onForgot,
  onBack,
  onDoor,
}: {
  door: 'sms' | 'pin';
  forgot: boolean;
  niche: string;
  remembered: RememberedWebAccount | null;
  t: Dict;
  trialDays: number;
  onForgot: () => void;
  onBack: () => void;
  onDoor: (next: 'sms' | 'pin') => void;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authAction, null);
  const [manual, setManual] = useState(!remembered);

  /* Сохранённый профиль показывается только на входе и только пока
     человек не попросил другой аккаунт. */
  if (door === 'sms' && !forgot && remembered && !manual && state === null) {
    return <RememberedAccount who={remembered} t={t} onOther={() => setManual(true)} />;
  }

  if (state?.step === 'done') {
    return (
      <div className={s.success}>
        <span className={s.check}>
          <IconCheck width={22} height={22} />
        </span>
        <p className={s.successText}>{state.message}</p>
        <p className={s.hint}>{t.auth.resetDoneNote}</p>
        <button type="button" className={s.quiet} onClick={onBack}>
          {t.auth.backToSignIn}
        </button>
      </div>
    );
  }

  if (state?.step === 'otp') return <OtpStep state={state} action={action} pending={pending} t={t} />;
  if (state?.step === 'name')
    return <NameStep state={state} action={action} pending={pending} t={t} niche={niche} trialDays={trialDays} />;
  if (state?.step === 'new-pin') return <NewPinStep state={state} action={action} pending={pending} t={t} />;

  const error = state?.step === 'credentials' ? state.error : undefined;

  if (forgot) {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="resetBegin" />

        <button type="button" className={s.back} onClick={onBack}>
          <IconBack width={14} height={14} />
          {t.auth.backToSignIn}
        </button>

        <Head title={t.auth.resetTitle} subtitle={t.auth.resetSub} />

        <PhoneField
          label={t.auth.phone}
          countryLabel={t.auth.country}
          autoFocus
          invalid={Boolean(error)}
        />

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={t.auth.resetSend} busy={t.auth.sending} />
        </div>
      </form>
    );
  }

  if (door === 'sms') {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="entry" />

        <Head title={t.auth.entryTitle} subtitle={t.auth.entrySub} />

        <PhoneField
          label={t.auth.phone}
          countryLabel={t.auth.country}
          autoComplete="tel"
          autoFocus
          invalid={Boolean(error)}
        />

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={t.auth.entrySend} busy={t.auth.sending} />
          {/* Вторая дверь строкой, а не вкладкой: ею входят мойщики,
              которым аккаунт завёл владелец, и она же остаётся, когда
              SMS не идёт. */}
          <button type="button" className={s.quiet} onClick={() => onDoor('pin')}>
            {t.auth.entryPinDoor}
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="signIn" />

      <Head title={t.auth.welcome} subtitle={t.auth.welcomeSub} />

      <PhoneField
        label={t.auth.phone}
        countryLabel={t.auth.country}
        autoComplete="username"
        invalid={Boolean(error)}
      />

      <div className="grid gap-2">
        <CodeInput
          name="pin"
          length={PIN_LENGTH}
          /* Четыре — не опечатка. Столько цифр у всех, кто завёл
             аккаунт до перехода на шесть, и требовать от них шесть
             значило бы запереть снаружи живых людей. Новый код всегда
             ровно шесть; здесь код только сверяется. */
          minLength={4}
          label={t.auth.pinGroup(PIN_LENGTH)}
          title={t.auth.pin}
          autoComplete="current-password"
          /* На входе форма уходит от последней цифры: это движение
             повторяют каждое утро, и лишнее нажатие в нём стоит дорого.
             На регистрации — нет, там человек ещё думает. */
          submitOnComplete
          revealable
          revealLabel={t.auth.showCode}
          hideLabel={t.auth.hideCode}
          enteredLabel={t.auth.entered}
          invalid={Boolean(error)}
        />
      </div>

      {error && <p className={s.error}>{error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={t.auth.signIn} busy={t.auth.signingIn} />
        <button type="button" className={s.quiet} onClick={onForgot}>
          {t.auth.forgotPin}
        </button>
        <button type="button" className={s.quiet} onClick={() => onDoor('sms')}>
          {t.auth.entrySmsDoor}
        </button>
      </div>
    </form>
  );
}

/* --------------------------- код из SMS --------------------------- */

function OtpStep({
  state,
  action,
  pending,
  t,
}: {
  state: Extract<AuthState, { step: 'otp' }>;
  action: (data: FormData) => void;
  pending: boolean;
  t: Dict;
}) {
  const left = useCountdown(state.resendAt);

  const intent =
    state.purpose === 'entry'
      ? 'entryVerify'
      : state.purpose === 'register'
        ? 'registerVerify'
        : state.purpose === 'reset'
          ? 'resetCheck'
          : 'stepUp';

  const title = state.purpose === 'step_up' ? t.auth.stepUpTitle : t.auth.otpTitle;
  const description =
    state.purpose === 'step_up'
      ? t.auth.stepUpSub(state.phoneMasked)
      : t.auth.otpSent(state.phoneMasked);

  return (
    <div className={s.step}>
      <Head title={title} subtitle={description} />

      <form action={action} className={s.body}>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="challengeId" value={state.challengeId} />

        <CodeInput
          name="code"
          length={CODE_LENGTH}
          label={t.auth.otpGroup(CODE_LENGTH)}
          /* Единственное место, где autoComplete именно такой: по нему
             iOS и Android подставляют код из SMS сами. */
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          enteredLabel={t.auth.entered}
          invalid={Boolean(state.error)}
        />

        {state.error && <p className={s.error}>{state.error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={t.auth.otpVerify} busy={t.auth.checking} />
        </div>
      </form>

      {/* Повтор отдельной формой: он не должен утаскивать с собой
          набранный код и не должен считаться попыткой ввода. */}
      <form action={action} className={s.actions}>
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <button type="submit" className={s.quiet} disabled={left > 0 || state.resendsLeft <= 0}>
          {left > 0 ? t.auth.otpResendIn(mmss(left)) : t.auth.otpResend}
        </button>
        {left === 0 && state.resendsLeft > 0 && state.resendsLeft <= 2 && (
          <p className={s.hint} style={{ textAlign: 'center' }}>
            {t.auth.otpResendsLeft(state.resendsLeft)}
          </p>
        )}
      </form>
    </div>
  );
}

/* ------------------------- название мойки ------------------------- */

/**
 * Последний шаг новичка.
 *
 * PIN здесь не спрашивается: входить он будет кодом. Два поля вместо
 * четырёх — и это единственный экран, который человек видит один раз в
 * жизни, поэтому на нём и стоит обещание про бесплатные дни.
 */
function NameStep({
  state,
  action,
  pending,
  t,
  niche,
  trialDays,
}: {
  state: Extract<AuthState, { step: 'name' }>;
  action: (data: FormData) => void;
  pending: boolean;
  t: Dict;
  niche: string;
  trialDays: number;
}) {
  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="signUp" />
      <input type="hidden" name="ticket" value={state.ticket} />
      <input type="hidden" name="niche" value={niche} />

      <Head title={t.auth.nameTitle} subtitle={t.auth.nameSub} />

      <div className={s.pair}>
        <label className="grid gap-2">
          <span className={s.label}>{t.onboarding.bizName}</span>
          <input className={s.text} name="businessName" required maxLength={80} autoFocus autoComplete="organization" />
        </label>

        <label className="grid gap-2">
          <span className={s.label}>{t.onboarding.ownerName}</span>
          <input className={s.text} name="ownerName" required maxLength={80} autoComplete="name" />
        </label>
      </div>

      {state.error && <p className={s.error}>{state.error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={t.auth.nameCreate} busy={t.auth.sending} />
        <p className={s.hint} style={{ textAlign: 'center' }}>
          {t.onboarding.freeDays(trialDays)}
        </p>
      </div>
    </form>
  );
}

/* ---------------------------- новый PIN ---------------------------- */

function NewPinStep({
  state,
  action,
  pending,
  t,
}: {
  state: Extract<AuthState, { step: 'new-pin' }>;
  action: (data: FormData) => void;
  pending: boolean;
  t: Dict;
}) {
  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="resetSave" />
      <input type="hidden" name="ticket" value={state.ticket} />

      <Head title={t.auth.newPin} subtitle={t.auth.pinMemo} />

      <CodeInput
        name="pin"
        length={PIN_LENGTH}
        label={t.auth.pinGroup(PIN_LENGTH)}
        title={t.auth.newPin}
        autoComplete="new-password"
        autoFocus
        revealable
        revealLabel={t.auth.showCode}
        hideLabel={t.auth.hideCode}
        enteredLabel={t.auth.entered}
        invalid={Boolean(state.error)}
      />

      {state.error && <p className={s.error}>{state.error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={t.auth.resetSave} busy={t.auth.checking} />
      </div>
    </form>
  );
}

/* ------------------------ сохранённый профиль ------------------------ */

function RememberedAccount({
  who,
  t,
  onOther,
}: {
  who: RememberedWebAccount;
  t: Dict;
  onOther: () => void;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(resumeSavedAccount, null);
  const color = personColor(who.name);

  return (
    <div className={s.avatarBlock}>
      <form action={action}>
        <button
          className={s.avatar}
          style={{
            background: color,
            boxShadow: `0 18px 42px color-mix(in srgb, ${color} 28%, transparent)`,
          }}
          aria-label={`${t.auth.signIn} — ${who.name}`}
          disabled={pending}
        >
          {pending ? <span className={s.spinner} /> : who.name.trim().slice(0, 1).toUpperCase()}
          <span className={s.avatarRing} aria-hidden />
        </button>
      </form>

      <div>
        <div className={s.who}>{who.name}</div>
        <div className={s.where}>{who.tenant}</div>
      </div>

      <p className={s.hint}>{t.auth.tapAvatar}</p>

      {state?.error && <p className={s.error}>{state.error}</p>}

      <button type="button" className={s.quiet} onClick={onOther}>
        {t.auth.anotherAccount}
      </button>
    </div>
  );
}

/* ------------------------------ мелочи ------------------------------ */

function Head({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className={s.head}>
      <h2 className={s.title}>{title}</h2>
      <p className={s.subtitle}>{subtitle}</p>
    </div>
  );
}

/**
 * Кнопка отправки.
 *
 * `disabled` во время отправки не украшение: без него двойное нажатие
 * шлёт две регистрации, и вторая упирается в занятый номер — тот самый,
 * который человек только что занял сам.
 */
function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <button className="btn" disabled={pending} aria-busy={pending}>
      {pending && <span className={s.spinner} aria-hidden />}
      {pending ? busy : idle}
    </button>
  );
}

/**
 * Секунды до момента `at`. Только для подписи кнопки — запрет на сервере.
 *
 * Тикает время, а не остаток: остаток из времени вычисляется на месте.
 * Хранить остаток пришлось бы пересчитывать при каждой смене `at` — то
 * есть писать состояние прямо в эффекте, а это лишний каскад отрисовок
 * там, где хватает вычитания.
 */
function useCountdown(at: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return Math.max(0, Math.ceil((at - now) / 1000));
}

function mmss(total: number): string {
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
