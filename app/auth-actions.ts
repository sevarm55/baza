'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ensureDb } from '@/lib/db/ready';
import { startSession } from '@/lib/auth';
import { clientIp } from '@/lib/login-guard';
import { markPointUsed } from '@/lib/accounts';
import { signalsFromHeaders } from '@/lib/risk';
import { deviceLabel } from '@/lib/security-log';
import {
  attemptLogin,
  beginPinReset,
  beginRegistration,
  checkResetCode,
  completePinReset,
  completeRegistration,
  completeStepUp,
  noteLoginSucceeded,
  otpState,
  resend,
  type LoginOutcome,
} from '@/lib/auth-flow';
import {
  authDict,
  isAuthLocale,
  LOCALE_COOKIE,
  pickAuthLocale,
  type AuthDict,
  type AuthLocale,
} from '@/lib/i18n/auth';

/**
 * Авторизация одним серверным действием.
 *
 * Не восемь действий, а одно с полем `intent`, и причина не в
 * аккуратности. Каждая экспортированная функция в файле с `use server` —
 * это отдельный открытый POST-эндпоинт, который придётся защищать
 * отдельно и о котором легко забыть. Здесь дверь одна, и всё, что через
 * неё проходит, проверяется в одном месте.
 *
 * Вторая причина — состояние. Вход, подтверждение номера и
 * восстановление кода это не три формы, а один разговор с ветвлениями:
 * ввёл телефон и код → попросили код из SMS → ошибся → попросили ещё
 * раз. Один `useActionState` на весь разговор описывает его прямо;
 * восемь — описывают его склейкой.
 *
 * Наружу не уходит ничего, чего человек не знал до запроса. «Такого
 * номера нет», «номер есть, но PIN другой», «этот аккаунт отключён» —
 * три подсказки тому, кто перебирает номера, и одно и то же сообщение
 * тому, кто ошибся.
 */

export type AuthState =
  | null
  /** обычная форма, с ошибкой или без */
  | { step: 'credentials'; error?: string }
  /** ждём код из SMS */
  | {
      step: 'otp';
      purpose: 'register' | 'step_up' | 'reset';
      challengeId: string;
      phoneMasked: string;
      /** мс эпохи: Date через границу сервер-клиент проходит, но числом надёжнее */
      resendAt: number;
      expiresAt: number;
      resendsLeft: number;
      error?: string;
    }
  /**
   * Код сошёлся, осталось придумать новый PIN.
   *
   * Здесь подписанный пропуск, а не сам код: код уже сгорел, и возить
   * действующий секрет между экранами незачем. Пропуск живёт десять
   * минут и обменивается ровно один раз.
   */
  | { step: 'new-pin'; ticket: string; error?: string }
  | { step: 'done'; message: string };

type Ctx = {
  ip: string | null;
  agent: string | null;
  signals: ReturnType<typeof signalsFromHeaders>;
  dict: AuthDict;
  /** язык, выбранный в окне; на нём же придёт код из SMS */
  locale: AuthLocale;
};

async function context(): Promise<Ctx> {
  const h = await headers();
  const jar = await cookies();

  const locale = pickAuthLocale({
    cookie: jar.get(LOCALE_COOKIE)?.value,
    acceptLanguage: h.get('accept-language'),
  });

  return {
    ip: clientIp(h),
    agent: h.get('user-agent'),
    signals: signalsFromHeaders(h),
    dict: authDict(locale),
    locale,
  };
}

function field(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === 'string' ? v.trim() : '';
}

/* ------------------------------ дверь ------------------------------ */

export async function authAction(prev: AuthState, data: FormData): Promise<AuthState> {
  await ensureDb();
  const ctx = await context();

  switch (field(data, 'intent')) {
    case 'signIn':
      return signIn(data, ctx);
    case 'stepUp':
      return stepUp(data, ctx, prev);
    case 'register':
      return registerBegin(data, ctx);
    case 'registerVerify':
      return registerVerify(data, ctx, prev);
    case 'resetBegin':
      return resetBegin(data, ctx);
    case 'resetCheck':
      return resetCheck(data, ctx, prev);
    case 'resetSave':
      return resetSave(data, ctx);
    case 'resend':
      return resendCode(data, ctx, prev);
    default:
      return { step: 'credentials', error: ctx.dict.errors.server };
  }
}

/* ------------------------------ вход ------------------------------ */

async function signIn(data: FormData, ctx: Ctx): Promise<AuthState> {
  const phone = field(data, 'phone');

  const outcome = await attemptLogin({
    phone,
    pin: field(data, 'pin'),
    ip: ctx.ip,
    signals: ctx.signals,
    countryCode: field(data, 'country') || undefined,
    locale: ctx.locale,
  });

  if (outcome.kind === 'throttled') {
    return {
      step: 'credentials',
      error: ctx.dict.errors.tooManyAttempts(Math.ceil(outcome.retryAfter / 60)),
    };
  }

  if (outcome.kind === 'denied') {
    return { step: 'credentials', error: ctx.dict.errors.invalidCredentials };
  }

  if (outcome.kind === 'step_up') {
    return {
      step: 'otp',
      purpose: 'step_up',
      challengeId: outcome.challengeId,
      phoneMasked: outcome.phoneMasked,
      resendAt: outcome.resendAt.getTime(),
      expiresAt: outcome.expiresAt.getTime(),
      resendsLeft: 3,
    };
  }

  await enter(outcome, ctx, { phone });
  redirect(outcome.membership.role === 'owner' ? '/owner' : '/work');
}

async function stepUp(data: FormData, ctx: Ctx, prev: AuthState): Promise<AuthState> {
  const result = await completeStepUp({
    challengeId: field(data, 'challengeId'),
    code: field(data, 'code'),
    ip: ctx.ip,
    agent: ctx.agent,
  });

  if (result.kind === 'otp') return otpError(prev, result.reason, ctx.dict);
  if (result.kind !== 'ok') return { step: 'credentials', error: ctx.dict.errors.invalidCredentials };

  await enter(result, ctx, { phone: '', alreadyLogged: true });
  redirect(result.membership.role === 'owner' ? '/owner' : '/work');
}

/* -------------------------- регистрация -------------------------- */

async function registerBegin(data: FormData, ctx: Ctx): Promise<AuthState> {
  const started = await beginRegistration(
    {
      niche: field(data, 'niche'),
      businessName: field(data, 'businessName'),
      ownerName: field(data, 'ownerName'),
      phone: field(data, 'phone'),
      pin: field(data, 'pin'),
      countryCode: field(data, 'country') || undefined,
      locale: ctx.locale,
    },
    { ip: ctx.ip, agent: ctx.agent },
  );

  if (!started.ok) {
    const say: Record<string, string> = {
      NICHE: ctx.dict.errors.server,
      NAME: ctx.dict.errors.required,
      PHONE: ctx.dict.errors.badPhone,
      PIN_LENGTH: ctx.dict.errors.pinLength,
      PIN_TRIVIAL: ctx.dict.errors.pinTrivial,
      PHONE_TAKEN: ctx.dict.errors.phoneTaken,
      THROTTLED: ctx.dict.errors.tooManyAttempts(Math.ceil((started.retryAfter ?? 3600) / 60)),
      SMS_FAILED: ctx.dict.errors.smsFailed,
    };
    return { step: 'credentials', error: say[started.problem] ?? ctx.dict.errors.server };
  }

  return {
    step: 'otp',
    purpose: 'register',
    challengeId: started.challengeId,
    phoneMasked: started.phoneMasked,
    resendAt: started.resendAt.getTime(),
    expiresAt: started.expiresAt.getTime(),
    resendsLeft: 3,
  };
}

async function registerVerify(data: FormData, ctx: Ctx, prev: AuthState): Promise<AuthState> {
  const done = await completeRegistration({
    challengeId: field(data, 'challengeId'),
    code: field(data, 'code'),
    ip: ctx.ip,
    signals: ctx.signals,
  });

  if (!done.ok) {
    if (done.problem === 'PHONE_TAKEN') {
      return { step: 'credentials', error: ctx.dict.errors.phoneTaken };
    }
    return otpError(prev, done.problem, ctx.dict);
  }

  await startSession(
    { uid: done.ownerId, tid: done.tenantId, role: 'owner' },
    { kind: 'web', device: deviceLabel(ctx.agent) },
  );
  await markPointUsed(done.ownerId);

  redirect('/owner');
}

/* ----------------------- восстановление PIN ----------------------- */

async function resetBegin(data: FormData, ctx: Ctx): Promise<AuthState> {
  const started = await beginPinReset({
    phone: field(data, 'phone'),
    countryCode: field(data, 'country') || undefined,
    ip: ctx.ip,
    agent: ctx.agent,
    locale: ctx.locale,
  });

  if (!started.ok) {
    return {
      step: 'credentials',
      error:
        started.problem === 'THROTTLED'
          ? ctx.dict.errors.tooManyAttempts(Math.ceil((started.retryAfter ?? 3600) / 60))
          : ctx.dict.errors.smsFailed,
    };
  }

  return {
    step: 'otp',
    purpose: 'reset',
    challengeId: started.challengeId,
    phoneMasked: started.phoneMasked,
    resendAt: started.resendAt.getTime(),
    expiresAt: started.expiresAt.getTime(),
    resendsLeft: 3,
  };
}

async function resetCheck(data: FormData, ctx: Ctx, prev: AuthState): Promise<AuthState> {
  const checked = await checkResetCode({
    challengeId: field(data, 'challengeId'),
    code: field(data, 'code'),
    ip: ctx.ip,
  });

  if (!checked.ok) return otpError(prev, checked.problem, ctx.dict);
  return { step: 'new-pin', ticket: checked.ticket };
}

async function resetSave(data: FormData, ctx: Ctx): Promise<AuthState> {
  const ticket = field(data, 'ticket');
  const done = await completePinReset({ ticket, pin: field(data, 'pin'), ip: ctx.ip, agent: ctx.agent });

  if (!done.ok) {
    if (done.problem === 'PIN_LENGTH') return { step: 'new-pin', ticket, error: ctx.dict.errors.pinLength };
    if (done.problem === 'PIN_TRIVIAL') return { step: 'new-pin', ticket, error: ctx.dict.errors.pinTrivial };
    // пропуск просрочен или уже обменян — честного пути отсюда нет, только сначала
    return { step: 'credentials', error: ctx.dict.errors.otpExpired };
  }

  /* Сессию здесь НЕ выдаём, и это не забывчивость. Человек назначил
     новый код — пусть войдёт им. Иначе восстановление становится вторым
     способом войти, со своими правилами, и защищать его придётся
     отдельно. */
  return { step: 'done', message: ctx.dict.forgotPin.done };
}

/* ------------------------ повторная отправка ------------------------ */

async function resendCode(data: FormData, ctx: Ctx, prev: AuthState): Promise<AuthState> {
  const challengeId = field(data, 'challengeId');
  const again = await resend({ challengeId, ip: ctx.ip });

  const base: Extract<AuthState, { step: 'otp' }> =
    prev?.step === 'otp'
      ? prev
      : {
          step: 'otp',
          purpose: 'register',
          challengeId,
          phoneMasked: '',
          resendAt: 0,
          expiresAt: 0,
          resendsLeft: 0,
        };

  if (!again.ok) {
    const live = await otpState(challengeId);
    return {
      ...base,
      resendAt: live?.resendAt.getTime() ?? base.resendAt,
      resendsLeft: live?.resendsLeft ?? 0,
      error:
        again.reason === 'SEND_FAILED'
          ? ctx.dict.errors.smsFailed
          : ctx.dict.errors.otpResendTooSoon,
    };
  }

  return {
    ...base,
    challengeId: again.challengeId,
    resendAt: again.resendAt.getTime(),
    expiresAt: again.expiresAt.getTime(),
    resendsLeft: again.resendsLeft,
    error: undefined,
  };
}

/* ------------------------------ язык ------------------------------ */

/**
 * Выбранный язык окна входа.
 *
 * Не HttpOnly: это предпочтение, а не секрет. `SameSite=Lax` всё равно
 * ставим — cookie без атрибутов в чужом контексте ведёт себя
 * непредсказуемо.
 */
export async function setAuthLocale(locale: string): Promise<void> {
  if (!isAuthLocale(locale)) return;

  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });
}

/* ------------------------------ общее ------------------------------ */

async function enter(
  outcome: Extract<LoginOutcome, { kind: 'ok' }>,
  ctx: Ctx,
  meta: { phone: string; alreadyLogged?: boolean },
): Promise<void> {
  await startSession(
    {
      uid: outcome.membership.id,
      tid: outcome.membership.tenantId,
      role: outcome.membership.role,
    },
    { kind: 'web', device: deviceLabel(ctx.agent) },
  );
  await markPointUsed(outcome.membership.id);

  await noteLoginSucceeded({
    outcome,
    phone: meta.phone,
    ip: ctx.ip,
    agent: ctx.agent,
    alreadyLogged: meta.alreadyLogged,
  });
}

function otpError(
  prev: AuthState,
  problem: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_TOO_MANY' | 'INVALID' | 'EXPIRED' | 'TOO_MANY_TRIES',
  dict: AuthDict,
): AuthState {
  const text =
    problem === 'OTP_EXPIRED' || problem === 'EXPIRED'
      ? dict.errors.otpExpired
      : problem === 'OTP_TOO_MANY' || problem === 'TOO_MANY_TRIES'
        ? dict.errors.otpTooMany
        : dict.errors.otpInvalid;

  /* Возвращаем ТОТ ЖЕ шаг с ошибкой, а не сбрасываем разговор: человек
     ошибся одной цифрой, и выкидывать его обратно к телефону значит
     заставить пройти всё заново из-за опечатки. */
  if (prev?.step === 'otp') return { ...prev, error: text };
  return { step: 'credentials', error: text };
}
