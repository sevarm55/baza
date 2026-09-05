'use client';

import { useActionState, useId, useState } from 'react';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';

import { authAction, type AuthState } from '@/app/auth-actions';
import { resumeSavedAccount } from '@/app/actions';
import {
  AuthButton,
  AuthError,
  AuthField,
  AuthHead,
  AuthLink,
  AuthPhone,
} from '@/components/landing/auth-ui';
import { PersonAvatar } from '@/components/patterns/person';
import { useT } from '@/lib/i18n/client';
import type { Dict } from '@/lib/i18n';
import type { RememberedWebAccount } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * Дверь витрины: вход, регистрация, восстановление.
 *
 * Раньше здесь жил разговор из шести шагов: телефон → код из SMS →
 * повторить отправку → придумать ПИН → назвать мойку. Кода из SMS
 * больше нет, и разговор распался на то, чем он и был по сути: две
 * формы и одно уведомление «идите в почту».
 *
 * Ролей на входе тоже больше нет. Прежде надо было сказать, владелец ты
 * или сотрудник, потому что от этого зависела дверь: одному код из SMS,
 * другому ПИН. Теперь дверь одна, и поле принимает и почту, и телефон —
 * решает сервер, а не человек. Спрашивать роль стало нечем и незачем.
 *
 * Что осталось прежним: разговор ведёт одно серверное действие и один
 * `useActionState`, а шаг приходит с сервера.
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
  /* Экран двери. Регистрация приходит снаружи, восстановление и возврат
     переключаются здесь. */
  const [view, setView] = useState<View>(mode === 'register' ? 'register' : 'signIn');
  const t = useT();

  return (
    <div className="flex flex-col gap-5">
      <Conversation
        /* Ключ обнуляет разговор при смене экрана: другого способа
           сбросить `useActionState` нет. */
        key={view}
        view={view}
        niche={niche}
        remembered={remembered}
        trialDays={trialDays}
        t={t}
        onView={setView}
      />
    </div>
  );
}

type View = 'signIn' | 'register' | 'reset';

/* Шаг разговора. Приходит снизу из размытия той же кривой, что и текст
   витрины. Между полями шестнадцать точек, а не тридцать две: тридцать
   две были ритмом разворота, где поле одно, а в форме регистрации их
   пять, и с таким шагом она переставала читаться единым бланком. */
const STEP =
  'flex flex-col gap-4 animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]';

function Conversation({
  view,
  niche,
  remembered,
  trialDays,
  t,
  onView,
}: {
  view: View;
  niche: string;
  remembered: RememberedWebAccount | null;
  trialDays: number;
  t: Dict;
  onView: (next: View) => void;
}) {
  const [state, action, pending] = useActionState<AuthState, FormData>(authAction, null);

  /* Письмо ушло — дальше человек уходит в почту, и никакой формы здесь
     быть не должно. Кнопки «отправить ещё раз» тоже нет намеренно: она
     нужна была коду, который живёт минуту, а ссылка живёт час. */
  if (state?.step === 'sent') {
    return (
      <div className={STEP}>
        <AuthHead className="mb-2" title={t.auth.sentTitle} subtitle={t.auth.sentSub(state.email)} />
        <p className="text-[13px] leading-relaxed text-muted-foreground">{t.auth.sentNote}</p>
        <AuthLink
          className="flex items-center gap-1 self-start no-underline"
          onClick={() => onView('signIn')}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t.auth.backToSignIn}
        </AuthLink>
      </div>
    );
  }

  const error = state?.step === 'form' ? state.error : undefined;

  /* ───────────────────── восстановление ───────────────────── */

  if (view === 'reset') {
    return (
      <form action={action} className={STEP}>
        <input type="hidden" name="intent" value="reset" />

        <AuthLink
          className="flex items-center gap-1 self-start no-underline"
          onClick={() => onView('signIn')}
        >
          <ChevronLeft aria-hidden className="size-4" />
          {t.auth.backToSignIn}
        </AuthLink>

        <AuthHead className="mb-2" title={t.auth.resetPasswordTitle} subtitle={t.auth.resetPasswordSub} />

        <AuthField
          label={t.auth.emailLabel}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          invalid={Boolean(error)}
        />

        <AuthError>{error}</AuthError>

        <Submit pending={pending} idle={t.auth.resetPasswordSend} busy={t.auth.sending} />
      </form>
    );
  }

  /* ───────────────────── регистрация ───────────────────── */

  if (view === 'register') {
    return (
      <form action={action} className={STEP}>
        <input type="hidden" name="intent" value="register" />
        <input type="hidden" name="niche" value={niche} />

        <AuthHead className="mb-2" title={t.auth.createTitle} subtitle={t.landing.hero.note(trialDays)} />

        <AuthField
          label={t.auth.businessName}
          name="businessName"
          autoComplete="organization"
          required
          invalid={Boolean(error)}
        />

        <AuthField
          label={t.auth.yourName}
          name="ownerName"
          autoComplete="name"
          required
          invalid={Boolean(error)}
        />

        <AuthField
          label={t.auth.registerEmail}
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          required
          invalid={Boolean(error)}
        />

        <AuthPhone label={t.auth.phone} countryLabel={t.auth.country} invalid={Boolean(error)} />

        <PasswordField
          label={t.auth.registerPassword}
          hint={t.auth.passwordHint}
          autoComplete="new-password"
          invalid={Boolean(error)}
          t={t}
        />

        <AuthError>{error}</AuthError>

        <div className="flex flex-col items-center gap-5">
          <Submit pending={pending} idle={t.auth.signUp} busy={t.auth.sending} />
          <AuthLink onClick={() => onView('signIn')}>{t.auth.haveAccount}</AuthLink>
        </div>
      </form>
    );
  }

  /* ───────────────────────── вход ───────────────────────── */

  return (
    <form action={action} className={STEP}>
      <input type="hidden" name="intent" value="signIn" />

      <AuthHead className="mb-2" title={t.auth.welcome} subtitle={t.auth.signInSub} />

      {remembered && <RememberedAccount account={remembered} t={t} />}

      {/* Одно поле на почту и на телефон. Владелец введёт адрес,
          мойщик — номер; что именно пришло, разбирает сервер. Два поля
          с переключателем заставляли бы человека сначала объяснить, кто
          он, чтобы потом сказать то же самое. */}
      <AuthField
        label={t.auth.loginLabel}
        hint={t.auth.loginHint}
        name="login"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        required
        invalid={Boolean(error)}
      />

      <PasswordField
        label={t.auth.passwordLabel}
        autoComplete="current-password"
        invalid={Boolean(error)}
        t={t}
      />

      <AuthError>{error}</AuthError>

      <div className="flex flex-col items-center gap-5">
        <Submit pending={pending} idle={t.auth.signIn} busy={t.auth.signingIn} />
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <AuthLink onClick={() => onView('reset')}>{t.auth.forgotPassword}</AuthLink>
          <AuthLink onClick={() => onView('register')}>{t.auth.noAccount}</AuthLink>
        </div>
      </div>
    </form>
  );
}

/* --------------------------- пароль --------------------------- */

/**
 * Поле пароля с глазом.
 *
 * Глаз не украшение: пароль набирают на телефоне, длинный и с большими
 * буквами, и «не тот пароль» после трёх попыток вслепую — самая частая
 * причина, по которой человек уходит в восстановление, зная пароль.
 *
 * Кнопка вне поля, а не внутри: внутри она перекрывала бы последние
 * знаки ровно тогда, когда их и хотят увидеть.
 */
function PasswordField({
  label,
  hint,
  autoComplete,
  invalid,
  t,
}: {
  label: string;
  hint?: string;
  autoComplete: 'current-password' | 'new-password';
  invalid: boolean;
  t: Dict;
}) {
  const [shown, setShown] = useState(false);
  const id = useId();

  return (
    <div className="flex flex-col gap-2">
      <AuthField
        label={label}
        hint={hint}
        id={id}
        name="password"
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        spellCheck={false}
        required
        invalid={invalid}
      />
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        className={cn(
          'flex items-center gap-1.5 self-start text-[13px] text-muted-foreground',
          'transition-colors outline-none hover:text-foreground focus-visible:text-foreground',
        )}
      >
        {shown ? (
          <EyeOff aria-hidden className="size-3.5" />
        ) : (
          <Eye aria-hidden className="size-3.5" />
        )}
        {shown ? t.auth.hidePassword : t.auth.showPassword}
      </button>
    </div>
  );
}

/* ---------------------- сохранённый профиль ---------------------- */

/**
 * Кто входил с этого браузера прошлый раз.
 *
 * Не поле, а лицо: человек нажимает на себя и оказывается внутри.
 * Пароль здесь не спрашивается — его заменяет подписанный пропуск в
 * HttpOnly-cookie, который выдаётся только по галочке в профиле.
 */
function RememberedAccount({ account, t }: { account: RememberedWebAccount; t: Dict }) {
  const [state, action, pending] = useActionState(resumeSavedAccount, null);

  return (
    <form action={action} className="flex flex-col gap-3">
      <button
        type="submit"
        disabled={pending}
        className={cn(
          'flex items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left',
          'transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60',
          'disabled:pointer-events-none disabled:opacity-55',
        )}
      >
        <PersonAvatar name={account.name} />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{account.name}</span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {pending ? t.auth.signingIn : t.auth.tapAvatar}
          </span>
        </span>
      </button>
      <AuthError>{state?.error}</AuthError>
    </form>
  );
}

function Submit({ pending, idle, busy }: { pending: boolean; idle: string; busy: string }) {
  return (
    <AuthButton type="submit" busy={pending} disabled={pending}>
      {pending ? busy : idle}
    </AuthButton>
  );
}
