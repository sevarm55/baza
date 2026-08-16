import { SignJWT, jwtVerify } from 'jose';
import { and, eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, authChallenges, users } from './db/schema';
import { hashPin, needsRehash, verifyPin } from './pin';
import { isValidPhone, isValidPin, maskPhone, normalizePhone, pinProblem } from './phone';
import { checkLogin, noteLogin } from './login-guard';
import { accountByPhone, markPhoneVerified, pointForLogin, type Point } from './accounts';
import { createBusiness, PhoneTakenError } from './tenant';
import { revokeAccountSessions } from './auth';
import { assessLogin, forgetDevices, rememberDevice, type DeviceSignals } from './risk';
import { logSecurity } from './security-log';
import { challengeState, resendChallenge, startChallenge, verifyChallenge } from './otp';
import { isNicheAvailable, type NicheKey } from './niches';

/**
 * Сценарии входа целиком — один раз, для веба и для приложения.
 *
 * Раньше вход был написан дважды: в серверном действии и в маршруте API.
 * Пока это были двадцать строк, дублирование ничего не стоило. С
 * подтверждением номера, повышением проверки и переносом хеша сценарий
 * перестал помещаться в двадцать строк, и две его копии разошлись бы на
 * первой же правке — причём разошлись бы молча и именно в защите.
 *
 * Здесь нет ни cookie, ни NextResponse, ни текстов для человека: этот
 * слой отвечает на вопрос «что произошло», а не «что показать». Веб
 * превращает ответ в состояние формы, приложение — в код ответа.
 */

/* ------------------------------ вход ------------------------------ */

export type LoginOutcome =
  /** пускать */
  | { kind: 'ok'; membership: Membership; accountId: string | null; fingerprint: string }
  /** сначала код из SMS */
  | { kind: 'step_up'; challengeId: string; phoneMasked: string; resendAt: Date; expiresAt: Date }
  /** не пускать; причина наружу не выходит */
  | { kind: 'denied' }
  | { kind: 'throttled'; retryAfter: number };

export type Membership = { id: string; tenantId: string; role: 'owner' | 'staff' };

/**
 * Постоянная работа впустую.
 *
 * Без неё неизвестный номер отвечает мгновенно, а известный — через
 * восемьдесят миллисекунд scrypt, и разница видна снаружи невооружённым
 * секундомером: получается способ перебрать номера, ни разу не угадав
 * PIN. Поэтому когда сверять нечего, мы всё равно сверяем — с заранее
 * заготовленным хешем, который не подойдёт никогда.
 *
 * Хеш считается один раз за жизнь процесса и от случайной строки: класть
 * сюда константу нельзя, иначе он же становится известным значением.
 */
let decoyHash: Promise<string> | null = null;

function decoy(): Promise<string> {
  decoyHash ??= hashPin(`decoy:${Math.random()}:${Date.now()}`);
  return decoyHash;
}

/**
 * Проверить телефон и PIN.
 *
 * Порядок важен и он такой:
 *   счётчик попыток → сверка кода → оценка риска → выдача.
 *
 * Счётчик первым, чтобы при переборе не выполнялся дорогой scrypt.
 * Оценка риска ПОСЛЕ сверки, а не до: иначе «нужен код из SMS» стало бы
 * ответом на неверный PIN и превратилось бы в подтверждение того, что
 * номер существует.
 */
export async function attemptLogin(input: {
  phone: string;
  pin: string;
  ip: string | null;
  signals: DeviceSignals;
  countryCode?: string;
  /** язык, выбранный в окне входа — на нём придёт код */
  locale?: string;
}): Promise<LoginOutcome> {
  const phone = normalizePhone(input.phone, input.countryCode);
  const pin = String(input.pin ?? '');
  const ip = input.ip;
  const agent = input.signals.agent ?? null;

  const guard = await checkLogin(phone, ip);
  if (!guard.allowed) {
    await logSecurity({ event: 'auth.login.throttled', phone, ip, agent });
    return { kind: 'throttled', retryAfter: guard.retryAfter };
  }

  const account = await accountByPhone(phone);

  /* Участие ищем только ради людей, которых завёл ещё старый код и не
     успел привязать к человеку. Своей копией кода они и сверяются. */
  const [legacy] = account
    ? []
    : await db.select().from(users).where(and(eq(users.phone, phone), eq(users.active, true)));

  const secret = account?.pinHash ?? legacy?.pinHash;
  const good = secret ? await verifyPin(pin, secret) : await verifyPin(pin, await decoy()).then(() => false);

  await noteLogin(phone, ip, good);

  if (!good) {
    await logSecurity({ event: 'auth.login.failed', phone, ip, agent, accountId: account?.id ?? null });
    return { kind: 'denied' };
  }

  const point = account ? await pointForLogin(account.id) : undefined;
  const membership = toMembership(point, legacy);

  // код верный, а работать негде: все участия отключены
  if (!membership) {
    await logSecurity({
      event: 'auth.login.failed',
      phone,
      ip,
      agent,
      accountId: account?.id ?? null,
      data: { reason: 'NO_ACTIVE_MEMBERSHIP' },
    });
    return { kind: 'denied' };
  }

  /* Код подошёл — самое время переложить его на текущий алгоритм. Тихо и
     здесь: открытый PIN есть в руках ровно сейчас, и другого момента для
     переноса не будет. Провал переноса вход не ломает. */
  if (secret && needsRehash(secret)) {
    void rehash(account?.id ?? null, membership.id, pin, phone).catch((e) =>
      console.error('[auth] перенос хеша не удался:', e),
    );
  }

  const risk = await assessLogin({
    accountId: account?.id ?? null,
    phone,
    phoneVerified: Boolean(account?.phoneVerifiedAt),
    signals: input.signals,
  });

  if (risk.newDevice) {
    await logSecurity({
      event: 'auth.login.new_device',
      phone,
      ip,
      agent,
      accountId: account?.id ?? null,
      data: { why: risk.why, stepUp: risk.stepUp },
    });
  }

  if (risk.stepUp && account) {
    const started = await startChallenge({
      purpose: 'step_up',
      phone,
      accountId: account.id,
      ip,
      payload: { accountId: account.id, fingerprint: risk.fingerprint, why: risk.why },
      locale: input.locale,
    });

    /* SMS не ушла — не запирать же человека, который знает свой код.
       Пускаем, но устройство знакомым НЕ делаем и оставляем след: если
       это был не он, событие останется в журнале. */
    if (!started.ok) {
      await logSecurity({
        event: 'auth.suspicious_activity',
        phone,
        ip,
        agent,
        accountId: account.id,
        data: { reason: 'STEP_UP_UNAVAILABLE', why: risk.why },
      });
      return { kind: 'ok', membership, accountId: account.id, fingerprint: '' };
    }

    await logSecurity({
      event: 'auth.login.step_up_required',
      phone,
      ip,
      agent,
      accountId: account.id,
      data: { why: risk.why },
    });

    return {
      kind: 'step_up',
      challengeId: started.challengeId,
      phoneMasked: maskPhone(phone),
      resendAt: started.resendAt,
      expiresAt: started.expiresAt,
    };
  }

  return { kind: 'ok', membership, accountId: account?.id ?? null, fingerprint: risk.fingerprint };
}

/**
 * Досдать код при входе с незнакомого устройства.
 *
 * Успех означает и вход, и запоминание устройства: второй раз с этого же
 * браузера кода не спросят. Именно поэтому `rememberDevice` живёт здесь,
 * а не в `attemptLogin`, — там он открыл бы дверь до проверки.
 */
export async function completeStepUp(input: {
  challengeId: string;
  code: string;
  ip: string | null;
  agent?: string | null;
}): Promise<LoginOutcome | { kind: 'otp'; reason: 'INVALID' | 'EXPIRED' | 'TOO_MANY_TRIES' }> {
  const verified = await verifyChallenge<{ accountId: string; fingerprint: string }>({
    challengeId: input.challengeId,
    code: input.code,
    purpose: 'step_up',
    ip: input.ip,
  });

  if (!verified.ok) return { kind: 'otp', reason: verified.reason };

  const { accountId, fingerprint } = verified.payload;
  const point = await pointForLogin(accountId);
  if (!point) return { kind: 'denied' };

  await rememberDevice({ accountId, fingerprint, agent: input.agent });

  await logSecurity({
    event: 'auth.login.success',
    phone: verified.challenge.phone,
    ip: input.ip,
    agent: input.agent ?? null,
    accountId,
    tenantId: point.id,
    userId: point.membershipId,
    data: { stepUp: true },
  });

  return {
    kind: 'ok',
    membership: { id: point.membershipId, tenantId: point.id, role: point.role },
    accountId,
    fingerprint,
  };
}

/**
 * Отметить состоявшийся вход.
 *
 * Отдельным вызовом, а не внутри `attemptLogin`: сессию заводит тот, кто
 * знает, куда её класть, — веб в cookie, приложение в токены. Устройство
 * запоминается здесь же, потому что «вход состоялся» и «устройство
 * знакомое» — это одно и то же событие.
 */
export async function noteLoginSucceeded(input: {
  outcome: Extract<LoginOutcome, { kind: 'ok' }>;
  phone: string;
  ip: string | null;
  agent?: string | null;
  /** уже отмечено внутри completeStepUp — второй раз не надо */
  alreadyLogged?: boolean;
}): Promise<void> {
  const { outcome } = input;

  if (outcome.accountId && outcome.fingerprint) {
    await rememberDevice({
      accountId: outcome.accountId,
      fingerprint: outcome.fingerprint,
      agent: input.agent,
    });
  }

  if (input.alreadyLogged) return;

  await logSecurity({
    event: 'auth.login.success',
    phone: input.phone,
    ip: input.ip,
    agent: input.agent ?? null,
    accountId: outcome.accountId,
    tenantId: outcome.membership.tenantId,
    userId: outcome.membership.id,
  });
}

function toMembership(
  point: Point | undefined,
  legacy: { id: string; tenantId: string; role: string } | undefined,
): Membership | null {
  if (point) return { id: point.membershipId, tenantId: point.id, role: point.role };
  if (legacy) {
    return {
      id: legacy.id,
      tenantId: legacy.tenantId,
      role: legacy.role === 'owner' ? 'owner' : 'staff',
    };
  }
  return null;
}

async function rehash(
  accountId: string | null,
  membershipId: string,
  pin: string,
  phone: string,
): Promise<void> {
  const pinHash = await hashPin(pin);

  if (accountId) {
    await db.transaction(async (tx) => {
      await tx.update(accounts).set({ pinHash }).where(eq(accounts.id, accountId));
      // копия в users живёт, пока схема обязана быть совместимой со старым кодом
      await tx.update(users).set({ pinHash }).where(eq(users.accountId, accountId));
    });
  } else {
    await db.update(users).set({ pinHash }).where(eq(users.id, membershipId));
  }

  await logSecurity({ event: 'auth.pin.rehashed', phone, accountId });
}

/* -------------------------- регистрация -------------------------- */

export type RegisterDraft = {
  niche: string;
  businessName: string;
  ownerName: string;
  phone: string;
  pin: string;
  countryCode?: string;
  /** язык, выбранный в окне входа — на нём придёт код */
  locale?: string;
};

export type RegisterProblem =
  | 'NICHE'
  | 'NAME'
  | 'PHONE'
  | 'PIN_LENGTH'
  | 'PIN_TRIVIAL'
  | 'PHONE_TAKEN'
  | 'THROTTLED'
  | 'SMS_FAILED';

export type BeginRegistration =
  | {
      ok: true;
      challengeId: string;
      phoneMasked: string;
      resendAt: Date;
      expiresAt: Date;
    }
  | { ok: false; problem: RegisterProblem; retryAfter?: number };

/**
 * Первый шаг регистрации: проверить всё и выслать код.
 *
 * В `accounts` при этом НЕ появляется ничего. Аккаунт заводится только
 * после подтверждения номера — иначе `/register` был бы фабрикой
 * мусорных бизнесов, а занятые номера копились бы от людей, которые до
 * второго шага так и не дошли.
 *
 * Заявка живёт десять минут и уходит сама. Открытого PIN в ней нет:
 * хешируем здесь и кладём в заявку уже хеш.
 *
 * «Номер занят» здесь показывается честно, и это осознанный размен.
 * Скрыть его нельзя: человек, который правда владеет этим номером,
 * обязан узнать, что аккаунт у него уже есть, а не получить SMS с
 * непонятным кодом. Ничего сверх факта занятости наружу не уходит — ни
 * имени, ни бизнеса, ни даты.
 */
export async function beginRegistration(
  draft: RegisterDraft,
  ctx: { ip: string | null; agent?: string | null },
): Promise<BeginRegistration> {
  const niche = String(draft.niche ?? '');
  const businessName = String(draft.businessName ?? '').trim();
  const ownerName = String(draft.ownerName ?? '').trim();
  const phone = normalizePhone(String(draft.phone ?? ''), draft.countryCode);
  const pin = String(draft.pin ?? '');

  if (!isNicheAvailable(niche)) return { ok: false, problem: 'NICHE' };
  if (businessName.length < 2 || businessName.length > 80) return { ok: false, problem: 'NAME' };
  if (ownerName.length < 2 || ownerName.length > 80) return { ok: false, problem: 'NAME' };
  if (!isValidPhone(phone, draft.countryCode)) return { ok: false, problem: 'PHONE' };

  const bad = pinProblem(pin);
  if (bad === 'length') return { ok: false, problem: 'PIN_LENGTH' };
  if (bad === 'trivial') return { ok: false, problem: 'PIN_TRIVIAL' };

  /* Проверка перед вставкой гарантии не даёт — её даёт уникальный индекс
     на втором шаге. Но слать SMS на номер, который заведомо занят, и
     заставлять человека вводить код ради отказа — хуже, чем сказать
     сразу. */
  if (await accountByPhone(phone)) return { ok: false, problem: 'PHONE_TAKEN' };

  const started = await startChallenge({
    purpose: 'register',
    phone,
    ip: ctx.ip,
    payload: {
      niche,
      businessName,
      ownerName,
      // в заявке между шагами лежит только хеш
      pinHash: await hashPin(pin),
    },
    locale: draft.locale,
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  await logSecurity({
    event: 'auth.register.started',
    phone,
    ip: ctx.ip,
    agent: ctx.agent ?? null,
    data: { niche },
  });

  return {
    ok: true,
    challengeId: started.challengeId,
    phoneMasked: maskPhone(phone),
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

export type CompleteRegistration =
  | { ok: true; tenantId: string; ownerId: string; accountId: string; ownerName: string }
  | { ok: false; problem: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_TOO_MANY' | 'PHONE_TAKEN' };

/**
 * Второй шаг: код сошёлся — заводим бизнес.
 *
 * Номер помечается подтверждённым здесь и только здесь. Устройство
 * запоминается сразу: человек только что доказал, что телефон его, — и
 * спрашивать код второй раз при первом же входе было бы издевательством.
 */
export async function completeRegistration(input: {
  challengeId: string;
  code: string;
  ip: string | null;
  signals: DeviceSignals;
}): Promise<CompleteRegistration> {
  const verified = await verifyChallenge<{
    niche: string;
    businessName: string;
    ownerName: string;
    pinHash: string;
  }>({
    challengeId: input.challengeId,
    code: input.code,
    purpose: 'register',
    ip: input.ip,
  });

  if (!verified.ok) {
    return {
      ok: false,
      problem:
        verified.reason === 'EXPIRED'
          ? 'OTP_EXPIRED'
          : verified.reason === 'TOO_MANY_TRIES'
            ? 'OTP_TOO_MANY'
            : 'OTP_INVALID',
    };
  }

  const phone = verified.challenge.phone;
  const { niche, businessName, ownerName, pinHash } = verified.payload;

  try {
    const { tenant, owner } = await createBusiness({
      niche: niche as NicheKey,
      businessName,
      ownerName,
      phone,
      pinHash,
      phoneVerified: true,
    });

    const [account] = await db.select().from(accounts).where(eq(accounts.phone, phone));

    if (account) {
      await rememberDevice({
        accountId: account.id,
        fingerprint: (await import('./risk')).fingerprint(input.signals),
        agent: input.signals.agent,
      });
    }

    await logSecurity({
      event: 'auth.register.completed',
      phone,
      ip: input.ip,
      agent: input.signals.agent ?? null,
      accountId: account?.id ?? null,
      tenantId: tenant.id,
      userId: owner.id,
      data: { niche },
    });

    return {
      ok: true,
      tenantId: tenant.id,
      ownerId: owner.id,
      accountId: account?.id ?? '',
      ownerName: owner.name,
    };
  } catch (e) {
    /* Между двумя шагами номер успели занять. Редко, но возможно: два
       телефона, одна регистрация. Уникальный индекс — единственное, что
       здесь надёжно, проверка на первом шаге была лишь вежливостью. */
    if (e instanceof PhoneTakenError) return { ok: false, problem: 'PHONE_TAKEN' };
    throw e;
  }
}

/* ----------------------- восстановление PIN ----------------------- */

export type BeginReset =
  | { ok: true; challengeId: string; phoneMasked: string; resendAt: Date; expiresAt: Date }
  /**
   * Номера мы не знаем, либо он не подтверждён.
   *
   * Наружу это выглядит ТАК ЖЕ, как успех: экран ввода кода показывается
   * всегда. Иначе форма восстановления превращается в справочник
   * зарегистрированных номеров — а она открыта без всякого входа.
   */
  | { ok: false; problem: 'THROTTLED' | 'SMS_FAILED'; retryAfter?: number };

export async function beginPinReset(input: {
  phone: string;
  countryCode?: string;
  ip: string | null;
  agent?: string | null;
  /** язык, выбранный в окне входа — на нём придёт код */
  locale?: string;
}): Promise<BeginReset> {
  const phone = normalizePhone(String(input.phone ?? ''), input.countryCode);

  if (!isValidPhone(phone, input.countryCode)) {
    // ответ как у успеха, но SMS никуда не идёт
    return silentReset(phone, input.ip);
  }

  const account = await accountByPhone(phone);

  /* Восстановление возможно только по подтверждённому номеру. Иначе оно
     само стало бы способом забрать чужой непроверенный аккаунт: кто
     угодно вводит чужой номер, получает SMS на СВОЙ телефон... нет, на
     чужой — но чужой телефон бывает в руках. Подтверждённый номер хотя
     бы означает, что этим номером уже доказывали владение. */
  if (!account || !account.phoneVerifiedAt) {
    await logSecurity({
      event: 'auth.pin.reset.started',
      phone,
      ip: input.ip,
      agent: input.agent ?? null,
      data: { delivered: false, reason: account ? 'UNVERIFIED_PHONE' : 'NO_ACCOUNT' },
    });
    return silentReset(phone, input.ip);
  }

  const started = await startChallenge({
    purpose: 'reset',
    phone,
    ip: input.ip,
    accountId: account.id,
    payload: { accountId: account.id },
    locale: input.locale,
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  await logSecurity({
    event: 'auth.pin.reset.started',
    phone,
    ip: input.ip,
    agent: input.agent ?? null,
    accountId: account.id,
    data: { delivered: true },
  });

  return {
    ok: true,
    challengeId: started.challengeId,
    phoneMasked: maskPhone(phone),
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

/**
 * Тот же ответ, что у настоящего успеха, но без SMS.
 *
 * Заявка НАСТОЯЩАЯ: строка в базе, живой код, тот же срок, те же
 * счётчики попыток и повторов. Не отправляется только сама SMS.
 *
 * Выдуманный идентификатор здесь не годится. Разница вылезла бы на
 * следующем шаге: настоящая заявка после пяти ошибок отвечает «слишком
 * много попыток», выдуманная отвечала бы «неверный код» вечно, — и это
 * готовый способ отличить зарегистрированный номер от чужого, не зная
 * ни одного кода.
 */
async function silentReset(phone: string, ip: string | null): Promise<BeginReset> {
  const started = await startChallenge({
    purpose: 'reset',
    phone,
    ip,
    silent: true,
    payload: { __silent: true },
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  return {
    ok: true,
    challengeId: started.challengeId,
    phoneMasked: maskPhone(phone),
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

/**
 * Проверить код восстановления и выдать пропуск на смену PIN.
 *
 * Почему пропуск, а не «запомним код до следующего экрана». Между вводом
 * кода и новым PIN стоит целый экран, на котором человек думает. Держать
 * код всё это время в состоянии формы значит гонять его туда-сюда между
 * браузером и сервером и оставлять в истории React лишнюю копию
 * действующего секрета — ровно того, который сейчас открывает аккаунт.
 *
 * Поэтому код сгорает здесь, сразу, а дальше идёт подписанный пропуск на
 * десять минут: он говорит «этот человек только что доказал номер» и
 * больше ничего не открывает. Одноразовость пропуска держится не
 * временем, а тем, что при обмене строка заявки УДАЛЯЕТСЯ: второй обмен
 * не найдёт её и уйдёт ни с чем.
 */
export async function checkResetCode(input: {
  challengeId: string;
  code: string;
  ip: string | null;
}): Promise<
  { ok: true; ticket: string } | { ok: false; problem: 'OTP_INVALID' | 'OTP_EXPIRED' | 'OTP_TOO_MANY' }
> {
  const verified = await verifyChallenge<{ accountId?: string }>({
    challengeId: input.challengeId,
    code: input.code,
    purpose: 'reset',
    ip: input.ip,
  });

  if (!verified.ok) {
    return {
      ok: false,
      problem:
        verified.reason === 'EXPIRED'
          ? 'OTP_EXPIRED'
          : verified.reason === 'TOO_MANY_TRIES'
            ? 'OTP_TOO_MANY'
            : 'OTP_INVALID',
    };
  }

  /* Пустышка с незарегистрированного номера ведёт себя как настоящая
     заявка во всём, кроме одного: подтвердить её нечем. Отвечаем тем же
     «код неверный», что и на неверный код. */
  if (!verified.payload.accountId) return { ok: false, problem: 'OTP_INVALID' };

  return {
    ok: true,
    ticket: await signTicket({
      accountId: verified.payload.accountId,
      challengeId: verified.challenge.id,
      phone: verified.challenge.phone,
    }),
  };
}

/* --------------------------- пропуск --------------------------- */

function ticketSecret(): Uint8Array {
  const base = process.env.SESSION_SECRET;
  if (!base && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET не задан');
  }
  /* Своя метка назначения: пропуск на смену PIN не должен подходить
     туда, куда подходит сессионный токен, даже если ключ один. */
  return new TextEncoder().encode(`pin-reset:${base ?? 'dev-only-insecure-secret'}`);
}

async function signTicket(claims: {
  accountId: string;
  challengeId: string;
  phone: string;
}): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(ticketSecret());
}

async function readTicket(
  ticket: string,
): Promise<{ accountId: string; challengeId: string; phone: string } | null> {
  try {
    const { payload } = await jwtVerify(ticket, ticketSecret());
    const { accountId, challengeId, phone } = payload as Record<string, unknown>;
    if (typeof accountId !== 'string' || typeof challengeId !== 'string') return null;
    return { accountId, challengeId, phone: typeof phone === 'string' ? phone : '' };
  } catch {
    return null;
  }
}

export type CompleteReset =
  | { ok: true; accountId: string; phone: string }
  | { ok: false; problem: 'TICKET_INVALID' | 'PIN_LENGTH' | 'PIN_TRIVIAL' };

/**
 * Код сошёлся — ставим новый PIN.
 *
 * Что происходит следом, важнее самой смены:
 *   гаснут ВСЕ сессии человека на всех его точках;
 *   стирается список знакомых устройств.
 *
 * Второе не менее нужно, чем первое. Если аккаунт уводили, у уводившего
 * могло остаться записанное «знакомое» устройство — и после
 * восстановления он входил бы без кода. Список обнуляется, дальше всё с
 * чистого листа.
 */
export async function completePinReset(input: {
  ticket: string;
  pin: string;
  ip: string | null;
  agent?: string | null;
}): Promise<CompleteReset> {
  const bad = pinProblem(String(input.pin ?? ''));
  if (bad === 'length') return { ok: false, problem: 'PIN_LENGTH' };
  if (bad === 'trivial') return { ok: false, problem: 'PIN_TRIVIAL' };

  const claims = await readTicket(String(input.ticket ?? ''));
  if (!claims) return { ok: false, problem: 'TICKET_INVALID' };

  /* Обмен пропуска: строка заявки удаляется, и её удаление — это и есть
     проверка «пропуском ещё не пользовались». Пустой результат означает,
     что кто-то уже обменял его раньше; тогда менять нечего. Атомарно, в
     одном запросе — двум одновременным попыткам не разойтись. */
  const [redeemed] = await db
    .delete(authChallenges)
    .where(eq(authChallenges.id, claims.challengeId))
    .returning({ id: authChallenges.id });

  if (!redeemed) return { ok: false, problem: 'TICKET_INVALID' };

  const accountId = claims.accountId;
  const phone = claims.phone;
  const pinHash = await hashPin(input.pin);

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ pinHash, phoneVerifiedAt: new Date() })
      .where(eq(accounts.id, accountId));
    // копия в users, пока схема обязана оставаться совместимой
    await tx.update(users).set({ pinHash }).where(eq(users.accountId, accountId));
  });

  await revokeAccountSessions(accountId);
  await forgetDevices(accountId);

  await logSecurity({
    event: 'auth.pin.reset',
    phone,
    ip: input.ip,
    agent: input.agent ?? null,
    accountId,
  });

  return { ok: true, accountId, phone };
}

/* ------------------------ повторная отправка ------------------------ */

export async function resend(input: { challengeId: string; ip: string | null }) {
  return resendChallenge(input);
}

export async function otpState(challengeId: string) {
  return challengeState(challengeId);
}

/* --------------------- подтверждение номера потом --------------------- */

/**
 * Подтвердить номер уже вошедшего человека.
 *
 * Для тех, кто зарегистрировался до появления кода из SMS. Предлагается
 * в кабинете, не требуется силой: заставить владельца подтверждать номер
 * посреди рабочего дня значит остановить мойку из-за нашего переезда.
 */
export async function beginPhoneProof(input: {
  accountId: string;
  phone: string;
  ip: string | null;
  locale?: string;
}) {
  return startChallenge({
    purpose: 'step_up',
    phone: input.phone,
    accountId: input.accountId,
    ip: input.ip,
    payload: { accountId: input.accountId, fingerprint: '', why: 'proof' },
    locale: input.locale,
  });
}

export async function completePhoneProof(input: {
  challengeId: string;
  code: string;
  accountId: string;
  ip: string | null;
}): Promise<boolean> {
  const verified = await verifyChallenge<{ accountId: string }>({
    challengeId: input.challengeId,
    code: input.code,
    purpose: 'step_up',
    ip: input.ip,
  });

  /* Заявка обязана принадлежать тому, кто пришёл. Без сверки чужой
     идентификатор заявки подтверждал бы чужой номер. */
  if (!verified.ok || verified.payload.accountId !== input.accountId) return false;

  await markPhoneVerified(input.accountId);
  await logSecurity({
    event: 'auth.otp.verified',
    phone: verified.challenge.phone,
    accountId: input.accountId,
    ip: input.ip,
    data: { purpose: 'proof' },
  });

  return true;
}

export { isValidPin };
