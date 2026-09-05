import { eq } from 'drizzle-orm';

import { db } from './db';
import { accounts, users } from './db/schema';
import { accountByEmail, accountByPhone, pointForLogin, type Point } from './accounts';
import { checkLogin, noteLogin } from './login-guard';
import { confirmLetter, resetLetter } from './auth-mail';
import { hashPassword, needsRehash, verifyPassword, checkPassword } from './password';
import { isValidPhone, normalizePhone } from './phone';
import { isNicheAvailable, type NicheKey } from './niches';
import { createBusiness, PhoneTakenError } from './tenant';
import { linkFor, startLink, verifyLink } from './email-link';
import { sendMail } from './mail';
import { logSecurity } from './security-log';
import { fingerprint, rememberDevice, type DeviceSignals } from './risk';
import { revokeAccountSessions } from './auth';
import type { Locale } from './i18n';

/**
 * Вход по логину и паролю.
 *
 * Пришёл на место телефона с шестизначным кодом и SMS. Причина не в
 * моде: код доходил до человека, только если армянский оператор
 * пропускал буквенного отправителя, и в один день тот перестал
 * пропускать молча — квитанция о доставке приходила, сообщение до трубки
 * не доходило. Вход, который держится на чужом усмотрении, не вход.
 *
 * Логин у владельца — почта, у сотрудника — телефон. Разделение не
 * прихоть: почту владелец имеет и читает, а мойщику её заводить негде, и
 * требование адреса упиралось бы в каждый наём. Пароль сотруднику выдаёт
 * владелец — генерирует или пишет сам и говорит вслух.
 *
 * Здесь нет ни cookie, ни NextResponse, ни текстов для человека: этот
 * слой отвечает на вопрос «что произошло», а не «что показать». Веб
 * превращает ответ в состояние формы, приложение — в код ответа.
 */

export type Membership = { id: string; tenantId: string; role: 'owner' | 'staff' };

export type LoginOutcome =
  | { kind: 'ok'; membership: Membership; accountId: string; fingerprint: string }
  /** не пускать; причина наружу не выходит */
  | { kind: 'denied' }
  | { kind: 'throttled'; retryAfter: number };

/**
 * Постоянная работа впустую.
 *
 * Без неё незнакомый логин отвечает мгновенно, а знакомый — через
 * восемьдесят миллисекунд scrypt, и разница видна снаружи невооружённым
 * секундомером: получается способ перебрать адреса, ни разу не угадав
 * пароль. Поэтому когда сверять нечего, мы всё равно сверяем — с заранее
 * заготовленным хешем, который не подойдёт никогда.
 *
 * Хеш считается один раз за жизнь процесса и от случайной строки: класть
 * сюда константу нельзя, иначе она же становится известным значением.
 */
let decoyHash: Promise<string> | null = null;

function decoy(): Promise<string> {
  decoyHash ??= hashPassword(`decoy:${Math.random()}:${Date.now()}`);
  return decoyHash;
}

/** Похоже ли введённое на адрес почты. Решает, где искать человека. */
export function looksLikeEmail(login: string): boolean {
  return login.includes('@');
}

/**
 * Простая проверка адреса.
 *
 * Строгой проверки почты не существует — стандарт разрешает такое, чего
 * не принимает ни один почтовик, — и попытки написать её точной всегда
 * заканчиваются отказом настоящему человеку. Настоящая проверка одна:
 * письмо дошло и по ссылке перешли.
 */
export function isValidEmail(email: string): boolean {
  const s = email.trim();
  if (s.length < 5 || s.length > 254) return false;
  const at = s.indexOf('@');
  if (at < 1 || at !== s.lastIndexOf('@')) return false;
  const domain = s.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.') && !/\s/.test(s);
}

function toMembership(point: Point | undefined): Membership | null {
  if (!point) return null;
  return { id: point.membershipId, tenantId: point.id, role: point.role };
}

/**
 * Проверить логин и пароль.
 *
 * Порядок важен и он такой:
 *   счётчик попыток → сверка пароля → участие → выдача.
 *
 * Счётчик первым, чтобы при переборе не выполнялся дорогой scrypt.
 * Причина отказа наружу не выходит ни в одной ветке: «нет такого адреса»
 * и «пароль не тот» отвечают одинаково, иначе форма входа становится
 * справочником зарегистрированных.
 */
export async function attemptLogin(input: {
  /** почта владельца или телефон сотрудника */
  login: string;
  password: string;
  ip: string | null;
  signals: DeviceSignals;
  countryCode?: string;
}): Promise<LoginOutcome> {
  const raw = String(input.login ?? '').trim();
  const password = String(input.password ?? '');
  const ip = input.ip;
  const agent = input.signals.agent ?? null;

  const byMail = looksLikeEmail(raw);
  /* Ключ счётчика — то, что ввели, приведённое к одному виду. У почты
     это нижний регистр, у телефона E.164: иначе `Sevak@` и `sevak@`
     считались бы разными и давали бы по пять попыток каждый. */
  const key = byMail ? raw.toLowerCase() : normalizePhone(raw, input.countryCode);

  const guard = await checkLogin(key, ip);
  if (!guard.allowed) {
    await logSecurity({ event: 'auth.login.throttled', phone: key, ip, agent });
    return { kind: 'throttled', retryAfter: guard.retryAfter };
  }

  const account = byMail ? await accountByEmail(key) : await accountByPhone(key);

  const good = account?.passwordHash
    ? await verifyPassword(password, account.passwordHash)
    : await verifyPassword(password, await decoy()).then(() => false);

  await noteLogin(key, ip, good);

  if (!good) {
    await logSecurity({
      event: 'auth.login.failed',
      phone: key,
      ip,
      agent,
      accountId: account?.id ?? null,
    });
    return { kind: 'denied' };
  }

  const point = await pointForLogin(account!.id);
  const membership = toMembership(point);

  // пароль верный, а работать негде: все участия отключены
  if (!membership) {
    await logSecurity({
      event: 'auth.login.failed',
      phone: key,
      ip,
      agent,
      accountId: account!.id,
      data: { reason: 'NO_ACTIVE_MEMBERSHIP' },
    });
    return { kind: 'denied' };
  }

  /* Пароль подошёл — самое время переложить его на текущие параметры
     scrypt. Тихо и здесь: открытый пароль есть в руках ровно сейчас, и
     другого момента для переноса не будет. Провал переноса вход не
     ломает. */
  if (account!.passwordHash && needsRehash(account!.passwordHash)) {
    void hashPassword(password)
      .then((next) =>
        db.update(accounts).set({ passwordHash: next }).where(eq(accounts.id, account!.id)),
      )
      .catch((e) => console.error('[auth] перенос хеша не удался:', e));
  }

  const fp = fingerprint(input.signals);
  await rememberDevice({ accountId: account!.id, fingerprint: fp, agent: input.signals.agent });

  return { kind: 'ok', membership, accountId: account!.id, fingerprint: fp };
}

/**
 * Отметить удачный вход в журнале безопасности.
 *
 * Отдельно от `attemptLogin`, потому что запись означает не «пароль
 * сошёлся», а «сессия выдана». Между этими двумя событиями стоит
 * вызывающий: веб ставит cookie, приложение выдаёт токен, и любой из них
 * может отказать. Запись до выдачи означала бы вход, которого не было.
 */
export async function noteLoginSucceeded(input: {
  outcome: Extract<LoginOutcome, { kind: 'ok' }>;
  login: string;
  ip: string | null;
  agent?: string | null;
}): Promise<void> {
  await logSecurity({
    event: 'auth.login.success',
    phone: input.login,
    ip: input.ip,
    agent: input.agent ?? null,
    accountId: input.outcome.accountId,
    tenantId: input.outcome.membership.tenantId,
    userId: input.outcome.membership.id,
  });
}

/* -------------------------- регистрация -------------------------- */

export type RegisterDraft = {
  niche: string;
  businessName: string;
  ownerName: string;
  email: string;
  password: string;
  /** телефон владельца: связь, а не вход */
  phone: string;
  /**
   * Заявку завело приложение, а не браузер.
   *
   * Нужно ровно в одном месте: после подтверждения человека надо вернуть
   * туда, откуда он ушёл. Пришедшего с сайта заводим в кабинет, как и
   * раньше; пришедшего из приложения — обратно в приложение, иначе он
   * остаётся в браузере с открытым кабинетом, которого не просил.
   */
  fromApp?: boolean;
  /**
   * Валюта мойки. Выбирается здесь и больше нигде.
   *
   * Приложение спрашивает её на регистрации; в браузере поля нет, и там
   * остаётся драм. Без этого поля выбор из приложения молча пропадал бы
   * по дороге — ровно так, как пропал PIN.
   */
  currency?: string;
  countryCode?: string;
  locale?: Locale;
};

export type RegisterProblem =
  | 'NICHE'
  | 'NAME'
  | 'EMAIL'
  | 'PHONE'
  | 'PASSWORD_SHORT'
  | 'PASSWORD_COMMON'
  | 'EMAIL_TAKEN'
  | 'PHONE_TAKEN'
  | 'THROTTLED'
  | 'MAIL_FAILED';

export type BeginRegistration =
  | { ok: true; email: string; expiresAt: Date }
  | { ok: false; problem: RegisterProblem; retryAfter?: number };

/**
 * Первый шаг регистрации: проверить всё и выслать письмо.
 *
 * В `accounts` при этом НЕ появляется ничего. Аккаунт заводится только
 * после перехода по ссылке — иначе регистрация была бы фабрикой мусорных
 * бизнесов, а занятые адреса копились бы от людей, которые до почты так
 * и не дошли.
 *
 * Заявка живёт час и уходит сама. Открытого пароля в ней нет: хешируем
 * здесь и кладём в заявку уже хеш.
 *
 * «Адрес занят» здесь показывается честно, и это осознанный размен.
 * Скрыть его нельзя: человек, который правда владеет ящиком, обязан
 * узнать, что аккаунт у него уже есть, а не получить письмо с непонятной
 * ссылкой. Ничего сверх факта занятости наружу не уходит — ни имени, ни
 * бизнеса, ни даты.
 */
export async function beginRegistration(
  draft: RegisterDraft,
  ctx: { ip: string | null; agent?: string | null },
): Promise<BeginRegistration> {
  const niche = String(draft.niche ?? '');
  const businessName = String(draft.businessName ?? '').trim();
  const ownerName = String(draft.ownerName ?? '').trim();
  const email = String(draft.email ?? '').trim();
  const password = String(draft.password ?? '');
  const phone = normalizePhone(String(draft.phone ?? ''), draft.countryCode);
  const locale: Locale = draft.locale ?? 'hy';

  if (!isNicheAvailable(niche)) return { ok: false, problem: 'NICHE' };
  if (businessName.length < 2 || businessName.length > 80) return { ok: false, problem: 'NAME' };
  if (ownerName.length < 2 || ownerName.length > 80) return { ok: false, problem: 'NAME' };
  if (!isValidEmail(email)) return { ok: false, problem: 'EMAIL' };
  if (!isValidPhone(phone, draft.countryCode)) return { ok: false, problem: 'PHONE' };

  const bad = checkPassword(password);
  if (bad === 'short' || bad === 'long') return { ok: false, problem: 'PASSWORD_SHORT' };
  if (bad === 'common') return { ok: false, problem: 'PASSWORD_COMMON' };

  /* Проверки перед вставкой гарантии не дают — её дают уникальные
     индексы на втором шаге. Но слать письмо на адрес, который заведомо
     занят, и заставлять человека идти в почту ради отказа — хуже, чем
     сказать сразу. */
  if (await accountByEmail(email)) return { ok: false, problem: 'EMAIL_TAKEN' };
  if (await accountByPhone(phone)) return { ok: false, problem: 'PHONE_TAKEN' };

  const started = await startLink({
    purpose: 'register',
    email,
    ip: ctx.ip,
    payload: {
      niche,
      businessName,
      ownerName,
      phone,
      locale,
      currency: draft.currency,
      fromApp: draft.fromApp === true,
      // в заявке между шагами лежит только хеш
      passwordHash: await hashPassword(password),
    },
  });

  if (!started.ok) {
    await logSecurity({ event: 'auth.mail.throttled', ip: ctx.ip, data: { purpose: 'register' } });
    return { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter };
  }

  const letter = confirmLetter(locale, linkFor('register', started.token));
  const sent = await sendMail({ to: email, ...letter });

  if (!sent.ok) {
    await logSecurity({
      event: 'auth.mail.send_failed',
      ip: ctx.ip,
      data: { purpose: 'register', reason: sent.reason },
    });
    return { ok: false, problem: 'MAIL_FAILED' };
  }

  await logSecurity({
    event: 'auth.register.started',
    ip: ctx.ip,
    agent: ctx.agent ?? null,
    data: { niche },
  });

  return { ok: true, email, expiresAt: started.expiresAt };
}

export type CompleteRegistration =
  | {
      ok: true;
      tenantId: string;
      ownerId: string;
      accountId: string;
      ownerName: string;
      email: string;
      /** заявку завело приложение — туда и возвращать */
      fromApp: boolean;
    }
  | { ok: false; problem: 'LINK_INVALID' | 'LINK_EXPIRED' | 'EMAIL_TAKEN' | 'PHONE_TAKEN' };

/**
 * Второй шаг: по ссылке перешли — заводим бизнес.
 *
 * Адрес помечается подтверждённым здесь и только здесь. Устройство
 * запоминается сразу: человек только что доказал, что ящик его.
 */
export async function completeRegistration(input: {
  token: string;
  ip: string | null;
  signals: DeviceSignals;
}): Promise<CompleteRegistration> {
  const verified = await verifyLink<{
    niche: string;
    businessName: string;
    ownerName: string;
    phone: string;
    currency?: string;
    fromApp?: boolean;
    passwordHash: string;
  }>({ token: input.token, purpose: 'register' });

  if (!verified.ok) {
    await logSecurity({
      event: 'auth.link.invalid',
      ip: input.ip,
      data: { purpose: 'register', reason: verified.reason },
    });
    return { ok: false, problem: verified.reason === 'EXPIRED' ? 'LINK_EXPIRED' : 'LINK_INVALID' };
  }

  const email = verified.email;
  const { niche, businessName, ownerName, phone, currency, fromApp, passwordHash } = verified.payload;

  /* Пока человек ходил в почту, адрес могли занять. Редко, но возможно:
     две вкладки, две регистрации. */
  if (await accountByEmail(email)) return { ok: false, problem: 'EMAIL_TAKEN' };

  try {
    const { tenant, owner } = await createBusiness({
      niche: niche as NicheKey,
      businessName,
      ownerName,
      phone,
      email,
      currency,
      passwordHash,
      emailVerified: true,
    });

    const account = await accountByPhone(phone);

    if (account) {
      await rememberDevice({
        accountId: account.id,
        fingerprint: fingerprint(input.signals),
        agent: input.signals.agent,
      });
    }

    await logSecurity({
      event: 'auth.register.completed',
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
      email,
      fromApp: fromApp === true,
    };
  } catch (e) {
    if (e instanceof PhoneTakenError) return { ok: false, problem: 'PHONE_TAKEN' };
    throw e;
  }
}

/* --------------------- восстановление пароля --------------------- */

/**
 * Наружу восстановление отвечает одинаково всегда.
 *
 * Есть такой адрес или нет, дошло письмо или нет — экран один и тот же.
 * Иначе форма восстановления превращается в справочник
 * зарегистрированных ящиков, а она открыта без всякого входа.
 */
export type BeginReset = { ok: true } | { ok: false; problem: 'THROTTLED'; retryAfter: number };

export async function beginPasswordReset(input: {
  email: string;
  ip: string | null;
  agent?: string | null;
  locale?: Locale;
  /** просьбу завело приложение — туда и возвращать после нового пароля */
  fromApp?: boolean;
}): Promise<BeginReset> {
  const email = String(input.email ?? '').trim();
  const locale: Locale = input.locale ?? 'hy';

  if (!isValidEmail(email)) return { ok: true };

  const account = await accountByEmail(email);
  /* Восстановление доступно только тому, чей адрес подтверждён. Иначе
     оно само стало бы способом угнать чужой неподтверждённый аккаунт:
     завёл бизнес на чужой ящик, не подтвердил, а потом «восстановил». */
  if (!account?.emailVerifiedAt) return { ok: true };

  const started = await startLink({
    purpose: 'reset',
    email,
    ip: input.ip,
    payload: { accountId: account.id, fromApp: input.fromApp === true },
  });

  if (!started.ok) return { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter };

  const letter = resetLetter(locale, linkFor('reset', started.token));
  const sent = await sendMail({ to: email, ...letter });

  if (!sent.ok) {
    await logSecurity({
      event: 'auth.mail.send_failed',
      accountId: account.id,
      ip: input.ip,
      data: { purpose: 'reset', reason: sent.reason },
    });
    // наружу всё равно как успех
    return { ok: true };
  }

  await logSecurity({
    event: 'auth.password.reset.started',
    accountId: account.id,
    ip: input.ip,
    agent: input.agent ?? null,
  });

  return { ok: true };
}

export type CompleteReset =
  | { ok: true; accountId: string; email: string; fromApp: boolean }
  | { ok: false; problem: 'LINK_INVALID' | 'LINK_EXPIRED' | 'PASSWORD_SHORT' | 'PASSWORD_COMMON' };

/**
 * Задать новый пароль по ссылке из письма.
 *
 * Все прежние сессии гасятся. Восстановлением пользуются, когда доступ
 * потерян или отобран, и оставить в живых сессию того, кто его отобрал,
 * значило бы сделать восстановление бессмысленным.
 */
export async function completePasswordReset(input: {
  token: string;
  password: string;
  ip: string | null;
}): Promise<CompleteReset> {
  const password = String(input.password ?? '');
  const bad = checkPassword(password);
  if (bad === 'short' || bad === 'long') return { ok: false, problem: 'PASSWORD_SHORT' };
  if (bad === 'common') return { ok: false, problem: 'PASSWORD_COMMON' };

  const verified = await verifyLink<{ accountId: string; fromApp?: boolean }>({
    token: input.token,
    purpose: 'reset',
  });

  if (!verified.ok) {
    await logSecurity({
      event: 'auth.link.invalid',
      ip: input.ip,
      data: { purpose: 'reset', reason: verified.reason },
    });
    return { ok: false, problem: verified.reason === 'EXPIRED' ? 'LINK_EXPIRED' : 'LINK_INVALID' };
  }

  const accountId = verified.payload.accountId;
  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(accounts.id, accountId));

  await revokeAccountSessions(accountId);

  await logSecurity({ event: 'auth.password.reset', accountId, ip: input.ip });

  return {
    ok: true,
    accountId,
    email: verified.email,
    fromApp: verified.payload.fromApp === true,
  };
}

/* ------------------- пароль сотрудника от владельца ------------------- */

export type IssuePassword =
  | { ok: true }
  | { ok: false; problem: 'PASSWORD_SHORT' | 'PASSWORD_COMMON' | 'NOT_FOUND' };

/**
 * Владелец назначает сотруднику пароль.
 *
 * Пишет сам или берёт сгенерированный (`generatePassword`) и говорит
 * вслух. Прежние сессии сотрудника гасятся: смена пароля после
 * увольнения обязана выкидывать из открытых вкладок, иначе она ничего
 * не значит.
 *
 * Проверить, что этот сотрудник действительно из этого бизнеса, обязан
 * вызывающий: здесь нет ни сессии, ни прав.
 */
export async function issueStaffPassword(input: {
  membershipId: string;
  password: string;
  byAccountId: string | null;
  ip: string | null;
}): Promise<IssuePassword> {
  const bad = checkPassword(input.password);
  if (bad === 'short' || bad === 'long') return { ok: false, problem: 'PASSWORD_SHORT' };
  if (bad === 'common') return { ok: false, problem: 'PASSWORD_COMMON' };

  const [member] = await db.select().from(users).where(eq(users.id, input.membershipId));
  if (!member?.accountId) return { ok: false, problem: 'NOT_FOUND' };

  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(input.password) })
    .where(eq(accounts.id, member.accountId));

  await revokeAccountSessions(member.accountId);

  await logSecurity({
    event: 'auth.password.issued',
    accountId: member.accountId,
    tenantId: member.tenantId,
    userId: member.id,
    ip: input.ip,
    data: { by: input.byAccountId },
  });

  return { ok: true };
}

/* --------------------- смена своего пароля --------------------- */

export type ChangePassword =
  | { ok: true }
  | { ok: false; problem: 'WRONG_CURRENT' | 'PASSWORD_SHORT' | 'PASSWORD_COMMON' };

/**
 * Сменить себе пароль, зная текущий.
 *
 * Текущий спрашивается обязательно: без него забытая на чужом
 * компьютере вкладка превращается в возможность отобрать аккаунт
 * навсегда.
 */
export async function changeOwnPassword(input: {
  accountId: string;
  current: string;
  next: string;
  ip: string | null;
}): Promise<ChangePassword> {
  const bad = checkPassword(input.next);
  if (bad === 'short' || bad === 'long') return { ok: false, problem: 'PASSWORD_SHORT' };
  if (bad === 'common') return { ok: false, problem: 'PASSWORD_COMMON' };

  const [account] = await db.select().from(accounts).where(eq(accounts.id, input.accountId));
  if (!account || !(await verifyPassword(input.current, account.passwordHash))) {
    return { ok: false, problem: 'WRONG_CURRENT' };
  }

  await db
    .update(accounts)
    .set({ passwordHash: await hashPassword(input.next) })
    .where(eq(accounts.id, account.id));

  await revokeAccountSessions(account.id);

  await logSecurity({ event: 'auth.password.changed', accountId: account.id, ip: input.ip });

  return { ok: true };
}
