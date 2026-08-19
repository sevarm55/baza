'use client';

import { useActionState, useEffect, useState } from 'react';
import { authAction, type AuthState } from '@/app/auth-actions';
import { resumeSavedAccount, type FormState } from '@/app/actions';
import { CodeInput } from '@/components/code-input';
import { PhoneField } from '@/components/phone-field';
import { SwitchMark } from '@/components/switch-mark';
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
 * ГЛАВНОЕ РЕШЕНИЕ ЭТОГО ЭКРАНА: спрашиваем не «каким кодом», а «кто вы».
 *
 * Кодов в продукте два, и раньше оба назывались PIN. Владельцу приходил
 * код из SMS, себе он мог завести постоянный, а сотруднику постоянный
 * выдавал хозяин мойки — и все три назывались одним словом. Человек,
 * которому пришло сообщение, искал в нём тот код, который ему когда-то
 * продиктовали, и не находил.
 *
 * Теперь у кодов разные имена — «код из SMS» и «код доступа», — а первый
 * вопрос экрана поменялся. «Владелец» и «Сотрудник» это не два дизайна и
 * не две формы: это один разговор, у которого от роли зависит состав
 * полей. Владельцу по умолчанию шлём код, потому что помнить ему нечего;
 * сотруднику сразу показываем оба поля, потому что код доступа ему уже
 * выдали вместе с номером.
 *
 * Сотруднику не показываем ни вход по SMS, ни восстановление, и это не
 * упрощение картинки, а правда о системе: номер сотруднику заводит
 * владелец, подтверждённым этот номер не становится (см. `claimAccount`),
 * а восстановление работает только по подтверждённому. Кнопка
 * «восстановить» ответила бы ему молчанием.
 *
 * Разговор ведёт одно серверное действие и один `useActionState`. Шаг
 * приходит с сервера: браузер не решает, показать ли экран кода из SMS,
 * — это решение принято там, где известно, знакомое ли устройство.
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
  /* Кто пришёл. Регистрация это всегда владелец: сотрудника заводит
     хозяин мойки, сам себя он завести не может. */
  const [who, setWho] = useState<Who>('owner');
  /* Чем входит владелец. У сотрудника способ один, и переключать ему
     нечего. */
  const [method, setMethod] = useState<Method>('sms');
  const [forgot, setForgot] = useState(false);

  /* Номер живёт ЗДЕСЬ, а не в поле.
   *
   * Разговор сбрасывается ключом при каждой смене роли и способа — иначе
   * `useActionState` тащит за собой ошибку от прошлой формы. Но вместе с
   * ним раньше обнулялся и телефон: человек набирал восемь цифр, нажимал
   * «войти по коду доступа» и получал пустое поле. Номер один и тот же
   * при любом способе входа, и переспрашивать его — работа, которую
   * продукт заставляет делать дважды. */
  const [phone, setPhone] = useState('');
  const [country, setCountry] = useState<string | undefined>(undefined);

  /* Язык берётся из общего контекста продукта, а не из своего состояния.
     Своя локализация у окна входа была, пока общей не существовало;
     теперь две системы означали бы две куки и два переключателя, которые
     разъедутся на первой правке. */
  const t = useT();

  return (
    <div className={s.surface}>
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
          /* Сотрудник входит кодом доступа всегда. Возвращаясь к
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

  const phoneField = (
    <PhoneField
      label={t.auth.phone}
      countryLabel={t.auth.country}
      defaultValue={phone}
      defaultCountry={country}
      onChange={onPhone}
      autoComplete={method === 'sms' ? 'tel' : 'username'}
      invalid={Boolean(error)}
    />
  );

  /* Восстановление кода доступа. Отдельная ветка, а не третья роль:
     сюда попадают только владельцы, и разговор здесь тот же самый —
     номер, код из SMS, новый код доступа. */
  if (forgot) {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="resetBegin" />

        <button type="button" className={s.back} onClick={onBack}>
          <IconBack width={14} height={14} />
          {t.auth.backToSignIn}
        </button>

        <Head title={t.auth.resetTitle} subtitle={t.auth.resetSub} />

        {phoneField}

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={t.auth.resetSend} busy={t.auth.sending} />
        </div>
      </form>
    );
  }

  const roles = (
    <WhoSwitch who={who} onWho={onWho} t={t} />
  );

  /* ───────── владелец: главная дверь, код приходит сам ───────── */

  if (who === 'owner' && method === 'sms') {
    return (
      <form action={action} className={s.step}>
        <input type="hidden" name="intent" value="entry" />

        {roles}
        <Head
          title={register ? t.auth.createTitle : t.auth.ownerTitle}
          subtitle={register ? t.auth.createSub : t.auth.entrySub}
        />

        {phoneField}

        {error && <p className={s.error}>{error}</p>}

        <div className={s.actions}>
          <Submit pending={pending} idle={t.auth.entrySend} busy={t.auth.sending} />
          {/* Вторая дверь строкой, а не второй кнопкой: главное действие
              на экране одно, и спорить с ним второй заливкой нельзя. */}
          <button type="button" className={s.quiet} onClick={() => onMethod('code')}>
            {t.auth.entryPinDoor}
          </button>
        </div>
      </form>
    );
  }

  /* ───────── постоянный код: у владельца по выбору, у сотрудника всегда ───────── */

  const staff = who === 'staff';

  return (
    <form action={action} className={s.step}>
      <input type="hidden" name="intent" value="signIn" />

      {roles}
      <Head
        title={staff ? t.auth.staffTitle : t.auth.ownerTitle}
        subtitle={staff ? t.auth.staffHelper : t.auth.ownerCodeHelper}
      />

      {phoneField}

      <CodeInput
        name="pin"
        length={PIN_LENGTH}
        /* Четыре — не опечатка. Столько цифр у всех, кто завёл аккаунт
           до перехода на шесть, и требовать от них шесть значило бы
           запереть снаружи живых людей. Новый код всегда ровно шесть;
           здесь код только сверяется. */
        minLength={4}
        label={t.auth.pinGroup(PIN_LENGTH)}
        title={t.auth.accessCodeField(PIN_LENGTH)}
        autoComplete="current-password"
        /* На входе форма уходит от последней цифры: это движение
           повторяют каждое утро, и лишнее нажатие в нём стоит дорого. */
        submitOnComplete
        revealable
        revealLabel={t.auth.showCode}
        hideLabel={t.auth.hideCode}
        enteredLabel={t.auth.entered}
        invalid={Boolean(error)}
      />

      {error && <p className={s.error}>{error}</p>}

      <div className={s.actions}>
        <Submit pending={pending} idle={t.auth.signIn} busy={t.auth.signingIn} />

        {/* Сотруднику ни SMS, ни восстановления: номер ему завёл
            владелец, подтверждённым этот номер не стал, и восстановление
            ответило бы ему молчанием. Забытый код доступа сотруднику
            выдаёт заново тот же владелец. */}
        {!staff && (
          <div className={s.quietRow}>
            <button type="button" className={s.quiet} onClick={() => onMethod('sms')}>
              {t.auth.entrySmsDoor}
            </button>
            <button type="button" className={s.quiet} onClick={onForgot}>
              {t.auth.forgotPin}
            </button>
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
 * Тот же жёлоб с переезжающей плашкой, что во всём продукте, но со
 * своими цветами: окно входа всплывает поверх чего угодно, и токены
 * кабинета (`--board-ink`) в нём означают не то же самое.
 */
function WhoSwitch({ who, onWho, t }: { who: Who; onWho: (next: Who) => void; t: Dict }) {
  const items: { key: Who; label: string }[] = [
    { key: 'owner', label: t.roles.owner },
    { key: 'staff', label: t.roles.staff },
  ];

  return (
    <div className={s.roles} role="group" aria-label={t.settings.role}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={s.roleItem}
          data-on={who === item.key ? '' : undefined}
          aria-pressed={who === item.key}
          onClick={() => onWho(item.key)}
        >
          {who === item.key && <SwitchMark id="auth-who" radius={7} fill="var(--up)" />}
          <span className={s.roleLabel}>{item.label}</span>
        </button>
      ))}
    </div>
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
          /* Новая заявка — пустые клетки. Повтор приходит со своим
             идентификатором, у старой заявки код уже погашен, и цифры от
             неё, оставшиеся в ряду, читаются как «код введён» — а он
             мёртвый. Ключ обнуляет поле ровно тогда, когда меняется
             заявка, и ни на кадр раньше. */
          key={state.challengeId}
          name="code"
          length={CODE_LENGTH}
          label={t.auth.otpGroup(CODE_LENGTH)}
          /* Единственное место, где autoComplete именно такой: по нему
             iOS и Android подставляют код из SMS сами. */
          autoComplete="one-time-code"
          autoFocus
          submitOnComplete
          /* Единственное место с просветом посреди ряда: код из SMS
             переписывают с другого экрана, и «204 815» сверяется
             взглядом, а «204815» — пересчитывается пальцем. Код доступа
             набирают по памяти, ему шов не нужен. */
          groupEvery={3}
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
 * Код доступа здесь не спрашивается: входить он будет кодом из SMS. Два
 * поля вместо четырёх — и это единственный экран, который человек видит
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

/* ------------------------ новый код доступа ------------------------ */

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
        title={t.auth.accessCodeField(PIN_LENGTH)}
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
