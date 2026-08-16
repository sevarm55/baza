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
  beginEntry,
  beginPinReset,
  completeEntry,
  completeSignUp,
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
import { dict, LOCALE_COOKIE, resolveLocale, type Dict, type Locale } from '@/lib/i18n';

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
      purpose: 'entry' | 'register' | 'step_up' | 'reset';
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
  /**
   * Код сошёлся, номер свободен — осталось назвать мойку.
   *
   * PIN здесь не спрашивается: входить человек будет кодом. Пропуск
   * подписан и обменивается один раз, иначе одна SMS заводила бы
   * сколько угодно моек.
   */
  | { step: 'name'; ticket: string; error?: string }
  | { step: 'done'; message: string };

type Ctx = {
  ip: string | null;
  agent: string | null;
  signals: ReturnType<typeof signalsFromHeaders>;
  t: Dict;
  /** язык, выбранный в окне; на нём же придёт код из SMS */
  locale: Locale;
};

async function context(): Promise<Ctx> {
  const h = await headers();
  const jar = await cookies();

  const locale = resolveLocale({
    chosen: jar.get(LOCALE_COOKIE)?.value,
    header: h.get('accept-language'),
  });

  return {
    ip: clientIp(h),
    agent: h.get('user-agent'),
    signals: signalsFromHeaders(h),
    t: dict(locale),
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
    case 'entry':
      return entryBegin(data, ctx);
    case 'entryVerify':
      return entryVerify(data, ctx, prev);
    case 'signUp':
      return signUp(data, ctx);
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
      return { step: 'credentials', error: ctx.t.errors.generic };
  }
}

/* ---------------------- вход по коду из SMS ---------------------- */

async function entryBegin(data: FormData, ctx: Ctx): Promise<AuthState> {
  const started = await beginEntry({
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
          ? ctx.t.auth.tooManyTries(Math.ceil((started.retryAfter ?? 3600) / 60))
          : ctx.t.auth.smsFailed,
    };
  }

  return {
    step: 'otp',
    purpose: 'entry',
    challengeId: started.challengeId,
    phoneMasked: started.phoneMasked,
    resendAt: started.resendAt.getTime(),
    expiresAt: started.expiresAt.getTime(),
    resendsLeft: 3,
  };
}

async function entryVerify(data: FormData, ctx: Ctx, prev: AuthState): Promise<AuthState> {
  const done = await completeEntry({
    challengeId: field(data, 'challengeId'),
    code: field(data, 'code'),
    ip: ctx.ip,
    signals: ctx.signals,
  });

  if (done.kind === 'otp') return otpError(prev, done.reason, ctx.t);
  if (done.kind === 'denied') return { step: 'credentials', error: ctx.t.auth.wrongCredentials };
  if (done.kind === 'new') return { step: 'name', ticket: done.ticket };

  await enter(
    { kind: 'ok', membership: done.membership, accountId: done.accountId, fingerprint: '' },
    ctx,
    { phone: done.phone, alreadyLogged: true },
  );
  redirect(done.membership.role === 'owner' ? '/owner' : '/work');
}

async function signUp(data: FormData, ctx: Ctx): Promise<AuthState> {
  const ticket = field(data, 'ticket');

  const made = await completeSignUp({
    ticket,
    niche: field(data, 'niche'),
    businessName: field(data, 'businessName'),
    ownerName: field(data, 'ownerName'),
    ip: ctx.ip,
    signals: ctx.signals,
  });

  if (!made.ok) {
    if (made.problem === 'NAME') return { step: 'name', ticket, error: ctx.t.errors.required };
    if (made.problem === 'PHONE_TAKEN') {
      return { step: 'credentials', error: ctx.t.auth.phoneTaken };
    }
    // пропуск просрочен или уже обменян — честного пути отсюда нет
    return { step: 'credentials', error: ctx.t.auth.otpExpired };
  }

  await startSession(
    { uid: made.ownerId, tid: made.tenantId, role: 'owner' },
    { kind: 'web', device: deviceLabel(ctx.agent) },
  );
  await markPointUsed(made.ownerId);

  redirect('/owner');
}

/* ------------------------ вход по PIN ------------------------ */

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
      error: ctx.t.auth.tooManyTries(Math.ceil(outcome.retryAfter / 60)),
    };
  }

  if (outcome.kind === 'denied') {
    return { step: 'credentials', error: ctx.t.auth.wrongCredentials };
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

  if (result.kind === 'otp') return otpError(prev, result.reason, ctx.t);
  if (result.kind !== 'ok') return { step: 'credentials', error: ctx.t.auth.wrongCredentials };

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
      NICHE: ctx.t.errors.generic,
      NAME: ctx.t.errors.required,
      PHONE: ctx.t.errors.badPhone,
      PIN_LENGTH: ctx.t.errors.badPin,
      PIN_TRIVIAL: ctx.t.auth.pinTrivial,
      PHONE_TAKEN: ctx.t.auth.phoneTaken,
      THROTTLED: ctx.t.auth.tooManyTries(Math.ceil((started.retryAfter ?? 3600) / 60)),
      SMS_FAILED: ctx.t.auth.smsFailed,
    };
    return { step: 'credentials', error: say[started.problem] ?? ctx.t.errors.generic };
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
      return { step: 'credentials', error: ctx.t.auth.phoneTaken };
    }
    return otpError(prev, done.problem, ctx.t);
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
          ? ctx.t.auth.tooManyTries(Math.ceil((started.retryAfter ?? 3600) / 60))
          : ctx.t.auth.smsFailed,
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

  if (!checked.ok) return otpError(prev, checked.problem, ctx.t);
  return { step: 'new-pin', ticket: checked.ticket };
}

async function resetSave(data: FormData, ctx: Ctx): Promise<AuthState> {
  const ticket = field(data, 'ticket');
  const done = await completePinReset({ ticket, pin: field(data, 'pin'), ip: ctx.ip, agent: ctx.agent });

  if (!done.ok) {
    if (done.problem === 'PIN_LENGTH') return { step: 'new-pin', ticket, error: ctx.t.errors.badPin };
    if (done.problem === 'PIN_TRIVIAL') return { step: 'new-pin', ticket, error: ctx.t.auth.pinTrivial };
    // пропуск просрочен или уже обменян — честного пути отсюда нет, только сначала
    return { step: 'credentials', error: ctx.t.auth.otpExpired };
  }

  /* Сессию здесь НЕ выдаём, и это не забывчивость. Человек назначил
     новый код — пусть войдёт им. Иначе восстановление становится вторым
     способом войти, со своими правилами, и защищать его придётся
     отдельно. */
  return { step: 'done', message: ctx.t.auth.resetDone };
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
          ? ctx.t.auth.smsFailed
          : ctx.t.auth.otpResendTooSoon,
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
  t: Dict,
): AuthState {
  const text =
    problem === 'OTP_EXPIRED' || problem === 'EXPIRED'
      ? t.auth.otpExpired
      : problem === 'OTP_TOO_MANY' || problem === 'TOO_MANY_TRIES'
        ? t.auth.otpTooMany
        : t.auth.otpInvalid;

  /* Возвращаем ТОТ ЖЕ шаг с ошибкой, а не сбрасываем разговор: человек
     ошибся одной цифрой, и выкидывать его обратно к телефону значит
     заставить пройти всё заново из-за опечатки. */
  if (prev?.step === 'otp') return { ...prev, error: text };
  return { step: 'credentials', error: text };
}
