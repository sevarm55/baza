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
  beginPasswordReset,
  beginRegistration,
  noteLoginSucceeded,
  type LoginOutcome,
  type RegisterProblem,
} from '@/lib/auth-password';
import { dict, LOCALE_COOKIE, resolveLocale, type Dict, type Locale } from '@/lib/i18n';

/**
 * Дверь витрины одним серверным действием.
 *
 * Не четыре действия, а одно с полем `intent`, и причина не в
 * аккуратности. Каждая экспортированная функция в файле с `use server` —
 * это отдельный открытый POST-эндпоинт, который придётся защищать
 * отдельно и о котором легко забыть. Здесь дверь одна, и всё, что через
 * неё проходит, проверяется в одном месте.
 *
 * Разговор стал короче прежнего. Кода из SMS больше нет, а с ним ушли
 * шаги «введите код», «повторить отправку», «придумайте ПИН»: их место
 * заняла ссылка в письме, а ссылка — это не шаг разговора, а уход и
 * возвращение. Осталось две формы и одно уведомление.
 *
 * Наружу не уходит ничего, чего человек не знал до запроса. «Такой почты
 * нет», «почта есть, но пароль другой», «этот аккаунт отключён» — три
 * подсказки тому, кто перебирает адреса, и одно и то же сообщение тому,
 * кто ошибся.
 */

export type AuthState =
  | null
  /** форма входа или регистрации, с ошибкой или без */
  | { step: 'form'; error?: string }
  /**
   * Письмо ушло, ждём перехода по ссылке.
   *
   * Адрес показывается человеку обратно намеренно: опечатка в нём —
   * самая частая причина, по которой письмо «не приходит», и увидеть её
   * можно только так.
   */
  | { step: 'sent'; email: string };

type Ctx = {
  ip: string | null;
  agent: string | null;
  signals: ReturnType<typeof signalsFromHeaders>;
  t: Dict;
  /** язык, выбранный в окне; на нём же придёт письмо */
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

/** Пароль не подрезаем: пробел по краям человек мог поставить осознанно. */
function secret(data: FormData, key: string): string {
  const v = data.get(key);
  return typeof v === 'string' ? v : '';
}

/* ------------------------------ дверь ------------------------------ */

export async function authAction(prev: AuthState, data: FormData): Promise<AuthState> {
  await ensureDb();
  const ctx = await context();

  switch (field(data, 'intent')) {
    case 'signIn':
      return signIn(data, ctx);
    case 'register':
      return register(data, ctx);
    case 'reset':
      return reset(data, ctx);
    default:
      return { step: 'form', error: ctx.t.errors.generic };
  }
}

/* ------------------------------ вход ------------------------------ */

async function signIn(data: FormData, ctx: Ctx): Promise<AuthState> {
  const login = field(data, 'login');
  const outcome = await attemptLogin({
    login,
    password: secret(data, 'password'),
    ip: ctx.ip,
    signals: ctx.signals,
    countryCode: field(data, 'country') || undefined,
  });

  if (outcome.kind === 'throttled') {
    return {
      step: 'form',
      error: ctx.t.auth.tooManyTries(Math.ceil(outcome.retryAfter / 60)),
    };
  }
  if (outcome.kind === 'denied') return { step: 'form', error: ctx.t.auth.wrongLogin };

  await enter(outcome, ctx, login);
  redirect(outcome.membership.role === 'owner' ? '/owner' : '/work');
}

/* --------------------------- регистрация --------------------------- */

async function register(data: FormData, ctx: Ctx): Promise<AuthState> {
  const email = field(data, 'email');

  const started = await beginRegistration(
    {
      niche: field(data, 'niche'),
      businessName: field(data, 'businessName'),
      ownerName: field(data, 'ownerName'),
      email,
      password: secret(data, 'password'),
      phone: field(data, 'phone'),
      countryCode: field(data, 'country') || undefined,
      locale: ctx.locale,
    },
    { ip: ctx.ip, agent: ctx.agent },
  );

  if (!started.ok) {
    return {
      step: 'form',
      error:
        started.problem === 'THROTTLED'
          ? ctx.t.auth.tooManyTries(Math.ceil((started.retryAfter ?? 3600) / 60))
          : registerError(started.problem, ctx.t),
    };
  }

  return { step: 'sent', email: started.email };
}

function registerError(problem: RegisterProblem, t: Dict): string {
  switch (problem) {
    case 'EMAIL':
      return t.auth.emailInvalid;
    case 'EMAIL_TAKEN':
      return t.auth.emailTaken;
    case 'PHONE':
      return t.errors.badPhone;
    case 'PHONE_TAKEN':
      return t.auth.phoneTaken;
    case 'PASSWORD_SHORT':
      return t.auth.passwordShort;
    case 'PASSWORD_COMMON':
      return t.auth.passwordCommon;
    case 'NAME':
      return t.errors.required;
    case 'MAIL_FAILED':
      return t.auth.mailFailed;
    default:
      return t.errors.generic;
  }
}

/* ------------------------ восстановление ------------------------ */

/**
 * Ответ здесь всегда один и тот же — «письмо ушло».
 *
 * Есть такой адрес или нет, подтверждён он или нет — экран не меняется.
 * Иначе форма восстановления превращается в справочник
 * зарегистрированных ящиков, а она открыта без всякого входа.
 */
async function reset(data: FormData, ctx: Ctx): Promise<AuthState> {
  const email = field(data, 'email');

  const started = await beginPasswordReset({
    email,
    ip: ctx.ip,
    agent: ctx.agent,
    locale: ctx.locale,
  });

  if (!started.ok) {
    return {
      step: 'form',
      error: ctx.t.auth.tooManyTries(Math.ceil(started.retryAfter / 60)),
    };
  }

  return { step: 'sent', email };
}

/* ------------------------------ общее ------------------------------ */

async function enter(
  outcome: Extract<LoginOutcome, { kind: 'ok' }>,
  ctx: Ctx,
  login: string,
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
  await noteLoginSucceeded({ outcome, login, ip: ctx.ip, agent: ctx.agent });
}
