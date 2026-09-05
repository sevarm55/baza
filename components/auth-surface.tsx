'use client';

import { useActionState, useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';

import { authAction, type AuthState } from '@/app/auth-actions';
import { resumeSavedAccount, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PersonAvatar } from '@/components/patterns/person';
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthHead,
  AuthLink,
  AuthPhone,
  AuthRoles,
} from '@/components/landing/auth-ui';
import { PIN_LENGTH } from '@/lib/phone';
import { CODE_LENGTH } from '@/lib/otp-shared';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import type { RememberedWebAccount } from '@/lib/auth';

/**
 * Форма входа и регистрации целиком.
 *
 * Живёт ровно в одном месте: в листе, который приходит от правого края
 * поверх витрины (`components/auth-dialog.tsx`). Отдельных страниц входа
 * больше нет, `/login` и `/start/:niche` уводят на тот же корень с
 * открытым листом. Оболочка снаружи, здесь только сам разговор.
 *
 * Органы у формы свои (`components/landing/auth-ui.tsx`), не общие с
 * кабинетом. Причина не в цвете, а в плотности: в кабинете человек
 * работает, и поля там в рамках, а витрина это разворот, где набор
 * крупный и линии волосяные. Продуктовые органы внутри неё читались
 * вставкой из другой системы.
 *
 * ГЛАВНОЕ РЕШЕНИЕ ЭТОГО ЭКРАНА: спрашиваем не «каким кодом», а «кто вы».
 * Владельцу по умолчанию шлём код из SMS, потому что помнить ему нечего;
 * сотруднику сразу показываем оба поля, потому что ПИН ему уже
 * выдал владелец. Сотруднику не показываем ни вход по SMS, ни
 * восстановление: его номер подтверждённым не становится, и
 * восстановление ответило бы ему молчанием.
 *
 * Разговор ведёт одно серверное действие и один `useActionState`. Шаг
 * приходит с сервера: решение, показывать ли код из SMS, принято там,
 * где известно, знакомое ли устройство.
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
  /* Кто пришёл. Регистрация это всегда владелец. */
  const [who, setWho] = useState<Who>('owner');
  /* Чем входит владелец. У сотрудника способ один. */
  const [method, setMethod] = useState<Method>('sms');
  const [forgot, setForgot] = useState(false);

  /* Номер живёт ЗДЕСЬ, а не в поле: разговор сбрасывается ключом при
     смене роли и способа, а телефон один и тот же при любом способе,
     и переспрашивать его значит заставлять набирать дважды. */
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<string | undefined>(undefined);

  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      <Conversation
        /* Ключ обнуляет разговор при смене роли, способа и при уходе в
           восстановление: другого способа сбросить useActionState нет. */
        key={`${who}:${method}:${forgot}`}
        who={who}
        method={method}
        forgot={forgot}
        niche={niche}
        register={mode === 'register'}
        remembered={remembered}
        t={t}
        trialDays={trialDays}
        phone={phone}
        country={country}
        onPhone={(nsn, code) => {
          setPhone(nsn);
          setCountry(code);
        }}
        onForgot={() => setForgot(true)}
        onBack={() => setForgot(false)}
        onWho={(next) => {
          setWho(next);
          /* Сотрудник входит ПИНом всегда. Возвращаясь к
             владельцу, отдаём ему главную дверь: код приходит сам. */
          setMethod(next === 'staff' ? 'code' : 'sms');
          setForgot(false);
        }}
        onMethod={(next) => {
          setMethod(next);
          setForgot(false);
        }}
      />
    </div>
  );
}

type Who = 'owner' | 'staff';
type Method = 'sms' | 'code';

/** Шаг разговора: появляется снизу, чуть поднимаясь. */
/* Шаг разговора. Приходит снизу из размытия той же кривой, что и текст
   витрины: лист вырезан из её страницы и двигаться обязан так же. */
const STEP =
  'flex flex-col gap-8 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

function Conversation({
  who,
  method,
  forgot,
  niche,
  register,
  remembered,
  t,
  trialDays,
  phone,
  country,
  onPhone,
  onForgot,
  onBack,
  onWho,
  onMethod,
}: {
  who: Who;
  method: Method;
  forgot: boolean;
  niche: string;
  register: boolean;
  remembered: RememberedWebAccount | null;
  t: Dict;
  trialDays: number;
  phone: string;
  country: string | undefined;
  onPhone: (nsn: string, country: string) => void;
  onForgot: () => void;
  onBack: () => void;
  onWho: (next: Who) => void;
  onMethod: (next: Method) => void;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authAction, null);
  const [manual, setManual] = useState(!remembered);

  /* Сохранённый профиль показывается только на входе владельца и только
     пока человек не попросил другой аккаунт. */
  if (who === 'owner' && method === 'sms' && !forgot && remembered && !manual && state === null) {
    return <RememberedAccount who={remembered} t={t} onOther={() => setManual(true)} />;
  }

  if (state?.step === 'done') {
    return (
      <div className={STEP}>
        {/* Отметка лаймом: тот же знак, которым витрина отвечает
            «записано» во второй секции. */}
        <span className="flex size-11 items-center justify-center rounded-2xl bg-[var(--lime)] text-[var(--lime-foreground)]">
          <svg
            aria-hidden
            viewBox="0 0 20 20"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4.5 10.5l3.6 3.6L15.5 6.5" />
          </svg>
        </span>
        <AuthHead title={state.message} subtitle={t.auth.resetDoneNote} />
        <AuthLink onClick={onBack}>{t.auth.backToSignIn}</AuthLink>
      </div>
    );
  }

  if (state?.step === 'otp') return <OtpStep state={state} action={action} pending={pending} t={t} />;
  if (state?.step === 'name')
    return <NameStep state={state} action={action} pending={pending} t={t} niche={niche} trialDays={trialDays} />;
  if (state?.step === 'new-pin') return <NewPinStep state={state} action={action} pending={pending} t={t} />;

  const error = state?.step === 'credentials' ? state.error : undefined;

  const phoneField = (
    <AuthPhone
      label={t.auth.phone}
      countryLabel={t.auth.country}
      defaultValue={phone}
      defaultCountry={country}
      onChange={onPhone}
      autoComplete={method === 'sms' ? 'tel' : 'username'}
      invalid={Boolean(error)}
    />
  );

  /* Восстановление ПИНа: отдельная ветка, а не третья роль.
     Сюда попадают только владельцы. */
  if (forgot) {
    return (
      <form action={action} className={STEP}>
        <input type="hidden" name="intent" value="resetBegin" />

        <AuthLink className="flex items-center gap-1 self-start no-underline" onClick={onBack}>
          <ChevronLeft aria-hidden className="size-4" />
          {t.auth.backToSignIn}
        </AuthLink>

        <AuthHead title={t.auth.resetTitle} subtitle={t.auth.resetSub} />

        {phoneField}

        <AuthError>{error}</AuthError>

        <Submit pending={pending} idle={t.auth.resetSend} busy={t.auth.sending} />
      </form>
    );
  }

  const roles = <WhoSwitch who={who} onWho={onWho} t={t} />;

  /* ───────── владелец: главная дверь, код приходит сам ───────── */

  if (who === 'owner' && method === 'sms') {
    return (
      <form action={action} className={STEP}>
        <input type="hidden" name="intent" value="entry" />

        {roles}
        <AuthHead
          title={register ? t.auth.createTitle : t.auth.ownerTitle}
          subtitle={register ? t.auth.createSub : t.auth.entrySub}
        />

        {phoneField}

        <AuthError>{error}</AuthError>

        <div className="flex flex-col items-center gap-5">
          <Submit pending={pending} idle={t.auth.entrySend} busy={t.auth.sending} />
          {/* Вторая дверь строкой, а не второй кнопкой: главное действие
              на экране одно. */}
          <AuthLink onClick={() => onMethod('code')}>{t.auth.entryPinDoor}</AuthLink>
        </div>
      </form>
    );
  }

  /* ───────── постоянный код: у владельца по выбору, у сотрудника всегда ───────── */

  const staff = who === 'staff';

  return (
    <form action={action} className={STEP}>
      <input type="hidden" name="intent" value="signIn" />

      {roles}
      <AuthHead
        title={staff ? t.auth.staffTitle : t.auth.ownerTitle}
        subtitle={staff ? t.auth.staffHelper : t.auth.ownerCodeHelper}
      />

      {phoneField}

      <CodeInput
        tone="landing"
        /* Точки, а не клетки: ПИН набирают на память. Клетки остаются
           коду из SMS, который переписывают глазами. */
        look="dots"
        name="pin"
        length={PIN_LENGTH}
        /* Четыре не опечатка: столько цифр у всех, кто завёл аккаунт до
           перехода на шесть. Новый код всегда ровно шесть; здесь код
           только сверяется. */
        minLength={4}
        label={t.auth.pinGroup(PIN_LENGTH)}
        title={t.auth.accessCodeField(PIN_LENGTH)}
        autoComplete="current-password"
        /* На входе форма уходит от последней цифры: это движение
           повторяют каждое утро. */
        submitOnComplete
        revealable
        revealLabel={t.auth.showCode}
        hideLabel={t.auth.hideCode}
        enteredLabel={t.auth.entered}
        invalid={Boolean(error)}
      />

      <AuthError>{error}</AuthError>

      <div className="flex flex-col items-center gap-5">
        <Submit pending={pending} idle={t.auth.signIn} busy={t.auth.signingIn} />

        {/* Сотруднику ни SMS, ни восстановления: забытый ПИН ему
            выдаёт заново владелец. */}
        {!staff && (
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            <AuthLink onClick={() => onMethod('sms')}>{t.auth.entrySmsDoor}</AuthLink>
            <AuthLink onClick={onForgot}>{t.auth.forgotPin}</AuthLink>
          </div>
        )}
      </div>
    </form>
  );
}

/* ------------------------- кто входит ------------------------- */

/**
 * Владелец или сотрудник.
 *
 * Два слова и подчёркивание, которое между ними переезжает
 * (`components/landing/auth-ui.tsx`). Дорожка с плашкой осталась в
 * кабинете: там переключают период отчёта по десять раз на дню, и орган
 * обязан быть кнопкой. Здесь выбор делают один раз и навсегда, и он
 * читается словом.
 */
function WhoSwitch({ who, onWho, t }: { who: Who; onWho: (next: Who) => void; t: Dict }) {
  return (
    <AuthRoles
      label={t.settings.role}
      current={who}
      onSelect={(key) => onWho(key as Who)}
      items={[
        { key: 'owner', label: t.roles.owner },
        { key: 'staff', label: t.roles.staff },
      ]}
    />
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
    <div className={STEP}>
      <AuthHead title={title} subtitle={description} />

      <form action={action} className="flex flex-col gap-7">
        <input type="hidden" name="intent" value={intent} />
        <input type="hidden" name="challengeId" value={state.challengeId} />

        <CodeInput
          tone="landing"
          /* Новая заявка: пустые клетки. Ключ обнуляет поле ровно тогда,
             когда меняется заявка, и ни на кадр раньше. */
          key={state.challengeId}
          name="code"
          length={CODE_LENGTH}
          label={t.auth.otpGroup(CODE_LENGTH)}
          /* Единственное место с таким autoComplete: по нему iOS и Android
             подставляют код из SMS сами. */
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          /* Единственное место с просветом посреди ряда: код из SMS
             переписывают с другого экрана, и «204 815» сверяется взглядом. */
          groupEvery={3}
          enteredLabel={t.auth.entered}
          invalid={Boolean(state.error)}
        />

        <AuthError>{state.error}</AuthError>

        <Submit pending={pending} idle={t.auth.otpVerify} busy={t.auth.checking} />
      </form>

      {/* Повтор отдельной формой: он не должен утаскивать с собой
          набранный код и не должен считаться попыткой ввода. */}
      <form action={action} className="flex flex-col items-center gap-1">
        <input type="hidden" name="intent" value="resend" />
        <input type="hidden" name="challengeId" value={state.challengeId} />
        <AuthLink
          type="submit"
          className="num disabled:pointer-events-none disabled:opacity-45"
          disabled={left > 0 || state.resendsLeft <= 0}
        >
          {left > 0 ? t.auth.otpResendIn(mmss(left)) : t.auth.otpResend}
        </AuthLink>
        {left === 0 && state.resendsLeft > 0 && state.resendsLeft <= 2 && (
          <p className="text-center text-xs text-muted-foreground">
            {t.auth.otpResendsLeft(state.resendsLeft)}
          </p>
        )}
      </form>
    </div>
  );
}

/* ------------------------- название мойки ------------------------- */

/**
 * Последний шаг новичка. ПИН здесь не спрашивается: входить он
 * будет кодом из SMS. Это единственный экран, который человек видит
 * один раз в жизни, поэтому на нём и стоит обещание про бесплатные дни.
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
    <form action={action} className={STEP}>
      <input type="hidden" name="intent" value="signUp" />
      <input type="hidden" name="ticket" value={state.ticket} />
      <input type="hidden" name="niche" value={niche} />

      <AuthHead title={t.auth.nameTitle} subtitle={t.auth.nameSub} />

      <div className="flex flex-col gap-7">
        <AuthField
          label={t.onboarding.bizName}
          name="businessName"
          required
          maxLength={80}
          autoFocus
          autoComplete="organization"
        />

        <AuthField
          label={t.onboarding.ownerName}
          name="ownerName"
          required
          maxLength={80}
          autoComplete="name"
        />
      </div>

      <AuthError>{state.error}</AuthError>

      <div className="flex flex-col items-center gap-4">
        <Submit pending={pending} idle={t.auth.nameCreate} busy={t.auth.sending} />
        <p className="text-[13px] text-muted-foreground">{t.onboarding.freeDays(trialDays)}</p>
      </div>
    </form>
  );
}

/* ------------------------ новый ПИН ------------------------ */

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
    <form action={action} className={STEP}>
      <input type="hidden" name="intent" value="resetSave" />
      <input type="hidden" name="ticket" value={state.ticket} />

      <AuthHead title={t.auth.newPin} subtitle={t.auth.pinMemo} />

      <CodeInput
        tone="landing"
        name="pin"
        length={PIN_LENGTH}
        label={t.auth.pinGroup(PIN_LENGTH)}
        title={t.auth.accessCodeField(PIN_LENGTH)}
        autoComplete="new-password"
        autoFocus
        revealable
        revealLabel={t.auth.showCode}
        hideLabel={t.auth.hideCode}
        enteredLabel={t.auth.entered}
        invalid={Boolean(state.error)}
      />

      <AuthError>{state.error}</AuthError>

      <Submit pending={pending} idle={t.auth.resetSave} busy={t.auth.checking} />
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

  return (
    <div className={`${STEP} items-center py-2 text-center`}>
      <form
        action={action}
        onSubmit={(e) => {
          if (pending) e.preventDefault();
        }}
      >
        {/* Не `disabled`: выключенная кнопка бледнеет, а бледный аватар
            в момент входа читается как «вход не удался». Второе нажатие
            гасит обработчик, форма гасит Enter. */}
        <button
          type="submit"
          className="rounded-2xl outline-none transition-transform focus-visible:ring-3 focus-visible:ring-[#c0390f]/40 active:scale-95 aria-busy:cursor-progress aria-busy:active:scale-100 dark:focus-visible:ring-[#ff6a2a]/40"
          aria-label={`${t.auth.signIn} · ${who.name}`}
          aria-busy={pending || undefined}
          aria-disabled={pending || undefined}
          onClick={(e) => {
            if (pending) e.preventDefault();
          }}
        >
          <PersonAvatar name={who.name} size="lg" className="size-16 text-xl" />
        </button>
      </form>

      <div className="flex flex-col gap-1.5">
        <div className="font-wordmark text-[20px] leading-none tracking-[-0.01em] uppercase">
          {who.name}
        </div>
        <div className="text-sm text-muted-foreground">{who.tenant}</div>
      </div>

      <p className="flex items-center gap-2 text-[13px] text-muted-foreground" aria-live="polite">
        {pending ? (
          <span
            aria-hidden
            className="size-3.5 animate-spin rounded-full border-2 border-current/30 border-t-current"
          />
        ) : null}
        {pending ? t.auth.signingIn : t.auth.tapAvatar}
      </p>

      <AuthError>{state?.error}</AuthError>

      <AuthLink onClick={onOther}>{t.auth.anotherAccount}</AuthLink>
    </div>
  );
}

/* ------------------------------ мелочи ------------------------------ */

/**
 * Кнопка отправки. Занятость не украшение: без неё двойное нажатие шлёт
 * две регистрации, и вторая упирается в занятый номер.
 */
function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <AuthButton type="submit" busy={pending} disabled={pending}>
      {pending ? busy : idle}
    </AuthButton>
  );
}

/**
 * Секунды до момента `at`. Только для подписи кнопки, запрет на сервере.
 * Тикает время, а не остаток: остаток вычисляется на месте.
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
