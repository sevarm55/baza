'use client';

import { useActionState, useEffect, useState } from 'react';
import { authAction, setAuthLocale, type AuthState } from '@/app/auth-actions';
import { resumeSavedAccount, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PhoneField } from '@/components/phone-field';
import { IconBack, IconCheck } from '@/components/icons';
import { SwitchMark } from '@/components/switch-mark';
import { personColor } from '@/lib/person-color';
import { PIN_LENGTH } from '@/lib/phone';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { AUTH_LOCALES, authDict, type AuthLocale } from '@/lib/i18n/auth';
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
  locale,
  trialDays,
}: {
  mode?: 'signIn' | 'register';
  niche: string;
  remembered?: RememberedWebAccount | null;
  locale: AuthLocale;
  trialDays: number;
}) {
  const [tab, setTab] = useState<'signIn' | 'register'>(mode);
  const [forgot, setForgot] = useState(false);
  const [lang, setLang] = useState<AuthLocale>(locale);

  const dict = authDict(lang);

  return (
    <div className={s.surface}>
      <div className={s.tabs} role="tablist">
        {(['signIn', 'register'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={s.tab}
            data-on={tab === k ? '' : undefined}
            onClick={() => {
              setTab(k);
              setForgot(false);
            }}
          >
            {tab === k && <SwitchMark id="auth-tabs" radius={8} fill="var(--surface)" />}
            <span className={s.tabLabel}>{k === 'signIn' ? dict.tabs.signIn : dict.tabs.register}</span>
          </button>
        ))}
      </div>

      <Conversation
        /* Ключ обнуляет разговор при смене вкладки и при уходе в
           восстановление: другого способа сбросить useActionState нет. */
        key={`${tab}:${forgot}`}
        tab={tab}
        forgot={forgot}
        niche={niche}
        remembered={remembered}
        dict={dict}
        trialDays={trialDays}
        onForgot={() => setForgot(true)}
        onBack={() => setForgot(false)}
      />

      <div className={s.langs}>
        {AUTH_LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            className={s.lang}
            data-on={lang === code ? '' : undefined}
            onClick={() => {
              setLang(code);
              void setAuthLocale(code);
            }}
            aria-pressed={lang === code}
          >
            {code}
          </button>
        ))}
      </div>
    </div>
  );
}

type Dict = ReturnType<typeof authDict>;

function Conversation({
  tab,
  forgot,
  niche,
  remembered,
  dict,
  trialDays,
  onForgot,
  onBack,
}: {
  tab: 'signIn' | 'register';
  forgot: boolean;
  niche: string;
  remembered: RememberedWebAccount | null;
  dict: Dict;
  trialDays: number;
  onForgot: () => void;
  onBack: () => void;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authAction, null);
  const [manual, setManual] = useState(!remembered);

  /* Сохранённый профиль показывается только на входе и только пока
     человек не попросил другой аккаунт. */
  if (tab === 'signIn' && !forgot && remembered && !manual && state === null) {
    return <RememberedAccount who={remembered} dict={dict} onOther={() => setManual(true)} />;
  }

  if (state?.step === 'done') {
    return (
      <div className={s.success}>
        <span className={s.check}>
          <IconCheck width={22} height={22} />
        </span>
        <p className={s.successText}>{state.message}</p>
        <p className={s.hint}>{dict.forgotPin.doneNote}</p>
        <button type="button" className={s.quiet} onClick={onBack}>
          {dict.forgotPin.backToLogin}
        </button>
      </div>
    );
  }

  if (state?.step === 'otp') return <OtpStep state={state} action={action} pending={pending} dict={dict} />;
  if (state?.step === 'new-pin') return <NewPinStep state={state} action={action} pending={pending} dict={dict} />;

  const error = state?.step === 'credentials' ? state.error : undefined;

  if (forgot) {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="resetBegin" />

        <button type="button" className={s.back} onClick={onBack}>
          <IconBack width={14} height={14} />
          {dict.forgotPin.backToLogin}
        </button>

        <Head title={dict.forgotPin.title} subtitle={dict.forgotPin.subtitle} />

        <PhoneField
          label={dict.phone.label}
          countryLabel={dict.phone.country}
          autoFocus
          invalid={Boolean(error)}
        />

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={dict.forgotPin.submit} busy={dict.register.submitting} />
        </div>
      </form>
    );
  }

  if (tab === 'register') {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="register" />
        <input type="hidden" name="niche" value={niche} />

        <Head title={dict.register.title} subtitle={dict.register.subtitle} />

        <div className={s.pair}>
          <label className="grid gap-2">
            <span className={s.label}>{dict.register.businessName}</span>
            <input
              className={s.text}
              name="businessName"
              required
              maxLength={80}
              autoComplete="organization"
            />
          </label>

          <label className="grid gap-2">
            <span className={s.label}>{dict.register.ownerName}</span>
            <input
              className={s.text}
              name="ownerName"
              required
              maxLength={80}
              autoComplete="name"
            />
          </label>
        </div>

        <PhoneField
          label={dict.register.phone}
          countryLabel={dict.phone.country}
          autoComplete="tel"
          invalid={Boolean(error)}
        />

        <div className="grid gap-2">
          <CodeInput
            name="pin"
            length={PIN_LENGTH}
            label={dict.pin.groupLabel(PIN_LENGTH)}
            title={dict.register.pin}
            autoComplete="new-password"
            revealable
            revealLabel={dict.pin.show}
            hideLabel={dict.pin.hide}
            enteredLabel={dict.pin.entered}
            invalid={Boolean(error)}
          />
          <p className={s.hint}>{dict.register.pinHint}</p>
        </div>

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={dict.register.submit} busy={dict.register.submitting} />
          <p className={s.hint} style={{ textAlign: 'center' }}>
            {dict.register.freeDays(trialDays)}
          </p>
        </div>
      </form>
    );
  }

  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="signIn" />

      <Head title={dict.login.title} subtitle={dict.login.subtitle} />

      <PhoneField
        label={dict.login.phone}
        countryLabel={dict.phone.country}
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
          label={dict.pin.groupLabel(PIN_LENGTH)}
          title={dict.login.pin}
          autoComplete="current-password"
          /* На входе форма уходит от последней цифры: это движение
             повторяют каждое утро, и лишнее нажатие в нём стоит дорого.
             На регистрации — нет, там человек ещё думает. */
          submitOnComplete
          revealable
          revealLabel={dict.pin.show}
          hideLabel={dict.pin.hide}
          enteredLabel={dict.pin.entered}
          invalid={Boolean(error)}
        />
      </div>

      {error && <p className={s.error}>{error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={dict.login.submit} busy={dict.login.submitting} />
        <button type="button" className={s.quiet} onClick={onForgot}>
          {dict.login.forgot}
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
  dict,
}: {
  state: Extract<AuthState, { step: 'otp' }>;
  action: (data: FormData) => void;
  pending: boolean;
  dict: Dict;
}) {
  const left = useCountdown(state.resendAt);

  const intent =
    state.purpose === 'register' ? 'registerVerify' : state.purpose === 'reset' ? 'resetCheck' : 'stepUp';

  const title = state.purpose === 'step_up' ? dict.stepUp.title : dict.otp.title;
  const description =
    state.purpose === 'step_up'
      ? dict.stepUp.description(state.phoneMasked)
      : dict.otp.description(state.phoneMasked);

  return (
    <div className={s.step}>
      <Head title={title} subtitle={description} />

      <form action={action} className={s.body}>
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="challengeId" value={state.challengeId} />

        <CodeInput
          name="code"
          length={CODE_LENGTH}
          label={dict.pin.otpGroupLabel(CODE_LENGTH)}
          /* Единственное место, где autoComplete именно такой: по нему
             iOS и Android подставляют код из SMS сами. */
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          enteredLabel={dict.pin.entered}
          invalid={Boolean(state.error)}
        />

        {state.error && <p className={s.error}>{state.error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={dict.otp.verify} busy={dict.otp.verifying} />
        </div>
      </form>

      {/* Повтор отдельной формой: он не должен утаскивать с собой
          набранный код и не должен считаться попыткой ввода. */}
      <form action={action} className={s.actions}>
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <button type="submit" className={s.quiet} disabled={left > 0 || state.resendsLeft <= 0}>
          {left > 0 ? dict.otp.resendIn(mmss(left)) : dict.otp.resend}
        </button>
        {left === 0 && state.resendsLeft > 0 && state.resendsLeft <= 2 && (
          <p className={s.hint} style={{ textAlign: 'center' }}>
            {dict.otp.resendsLeft(state.resendsLeft)}
          </p>
        )}
      </form>
    </div>
  );
}

/* ---------------------------- новый PIN ---------------------------- */

function NewPinStep({
  state,
  action,
  pending,
  dict,
}: {
  state: Extract<AuthState, { step: 'new-pin' }>;
  action: (data: FormData) => void;
  pending: boolean;
  dict: Dict;
}) {
  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="resetSave" />
      <input type="hidden" name="ticket" value={state.ticket} />

      <Head title={dict.forgotPin.newPin} subtitle={dict.forgotPin.newPinHint} />

      <CodeInput
        name="pin"
        length={PIN_LENGTH}
        label={dict.pin.groupLabel(PIN_LENGTH)}
        title={dict.forgotPin.newPin}
        autoComplete="new-password"
        autoFocus
        revealable
        revealLabel={dict.pin.show}
        hideLabel={dict.pin.hide}
        enteredLabel={dict.pin.entered}
        invalid={Boolean(state.error)}
      />

      {state.error && <p className={s.error}>{state.error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={dict.forgotPin.save} busy={dict.otp.verifying} />
      </div>
    </form>
  );
}

/* ------------------------ сохранённый профиль ------------------------ */

function RememberedAccount({
  who,
  dict,
  onOther,
}: {
  who: RememberedWebAccount;
  dict: Dict;
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
          aria-label={`${dict.login.submit} — ${who.name}`}
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

      <p className={s.hint}>{dict.login.tapAvatar}</p>

      {state?.error && <p className={s.error}>{state.error}</p>}

      <button type="button" className={s.quiet} onClick={onOther}>
        {dict.login.anotherAccount}
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
