import { eq } from 'drizzle-orm';
import { db } from './db';
import { accounts, users, type Account } from './db/schema';
import { hasPin, verifyPin } from './pin';
import { isValidPhone, normalizePhone } from './phone';
import { checkLogin, noteLogin } from './login-guard';
import { startChallenge, verifyChallenge } from './otp';
import { forgetDevices } from './risk';
import { revokeAccountSessions } from './auth';
import { logSecurity } from './security-log';

/**
 * Смена номера телефона.
 *
 * Номер — это логин. Поэтому не поле в форме профиля, а отдельный
 * сценарий, и в нём два доказательства, оба обязательные:
 *
 *   кто ты        — PIN, а у кого его нет, код на ТЕКУЩИЙ номер.
 *                   Доказывает, что за экраном хозяин, а не тот, кому
 *                   оставили разблокированный телефон;
 *   код на НОВЫЙ  — доказывает, что новый номер существует и
 *   номер           принадлежит ему же. Без этого сменой номера можно
 *                   передать аккаунт кому угодно, включая себя.
 *
 * Чем доказывать, решает состояние аккаунта, а не клиент: присланный им
 * признак «у меня нет PIN» был бы способом обойти PIN.
 *
 * Код здесь общий для кабинета и приложения намеренно. Логика жила
 * внутри маршрута `/api/v1/auth/phone`, и кабинету, который ходит по
 * cookie, а не по токену, пришлось бы написать её второй раз. Две копии
 * правил безопасности расходятся на первой же правке, и расходятся тихо:
 * дыра появляется в той, о которой забыли.
 */

/**
 * Чем этот аккаунт доказывает, что он хозяин.
 *
 * У заведённых по коду из SMS PIN-а нет вовсе: `pin_hash` помечен «кода
 * нет», и `verifyPin` отказывает всегда. Вопрос «введите PIN» для них
 * неотвечаем — номер они не сменили бы НИКОГДА. А номер это логин, и
 * потеря доступа к нему означает потерю бизнеса.
 */
export function changeNeedsCode(account: Pick<Account, 'pinHash'>): boolean {
  return !hasPin(account.pinHash);
}

export type PhoneChallenge =
  | { ok: true; challengeId: string; resendAt: Date; expiresAt: Date }
  | { ok: false; problem: 'THROTTLED' | 'SMS_FAILED'; retryAfter?: number };

/**
 * Нулевой шаг для тех, у кого нет PIN: код на СВОЙ номер.
 *
 * Проверяет ровно то же, что PIN, — что за экраном хозяин. Код на новый
 * номер после этого спрашивается всё равно, вторым.
 */
export async function startSelfProof(input: {
  account: Pick<Account, 'id' | 'phone'>;
  ip: string | null;
  locale?: string;
}): Promise<PhoneChallenge> {
  const started = await startChallenge({
    purpose: 'step_up',
    phone: input.account.phone,
    accountId: input.account.id,
    ip: input.ip,
    payload: { accountId: input.account.id, fingerprint: '', why: 'phone_change' },
    locale: input.locale,
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  return {
    ok: true,
    challengeId: started.challengeId,
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

/** Что может пойти не так на любом из двух шагов. */
export type PhoneProblem =
  /** у аккаунта нет PIN — сначала `startSelfProof` */
  | 'NEED_PROOF'
  | 'BAD_PHONE'
  | 'SAME_PHONE'
  | 'PHONE_TAKEN'
  | 'WRONG_PIN'
  | 'THROTTLED'
  | 'CODE_INVALID'
  | 'CODE_EXPIRED'
  | 'CODE_TOO_MANY'
  | 'SMS_FAILED';

export type PhoneStart =
  | { ok: true; challengeId: string; phone: string; resendAt: Date; expiresAt: Date }
  | { ok: false; problem: PhoneProblem; retryAfter?: number };

/**
 * Шаг первый: доказать себя и назвать новый номер.
 *
 * Занятость нового номера проверяется ДО отправки: слать код на номер,
 * который всё равно не примут, незачем. Настоящую гарантию по-прежнему
 * даёт уникальный индекс на втором шаге — между проверкой и вводом кода
 * номер могут занять.
 */
export async function startPhoneChange(input: {
  account: Pick<Account, 'id' | 'phone' | 'pinHash'>;
  phone: string;
  country?: string;
  pin?: string;
  proofId?: string;
  proofCode?: string;
  ip: string | null;
  locale?: string;
}): Promise<PhoneStart> {
  const byCode = changeNeedsCode(input.account);
  const proofId = String(input.proofId ?? '').trim();
  if (byCode && !proofId) return { ok: false, problem: 'NEED_PROOF' };

  const phone = normalizePhone(String(input.phone ?? ''), input.country);
  if (!phone || !isValidPhone(phone, input.country)) return { ok: false, problem: 'BAD_PHONE' };
  if (phone === input.account.phone) return { ok: false, problem: 'SAME_PHONE' };

  /* Тот же счётчик попыток, что на входе: иначе это тихий способ
     подобрать PIN изнутри уже открытой сессии — без блокировки и без
     следа в истории входов. */
  const guard = await checkLogin(input.account.phone, input.ip);
  if (!guard.allowed) return { ok: false, problem: 'THROTTLED', retryAfter: guard.retryAfter };

  if (byCode) {
    const proved = await verifyChallenge<{ accountId: string }>({
      challengeId: proofId,
      code: String(input.proofCode ?? '').trim(),
      purpose: 'step_up',
      ip: input.ip,
    });

    if (!proved.ok) {
      return {
        ok: false,
        problem:
          proved.reason === 'EXPIRED'
            ? 'CODE_EXPIRED'
            : proved.reason === 'TOO_MANY_TRIES'
              ? 'CODE_TOO_MANY'
              : 'CODE_INVALID',
      };
    }

    /* Заявка обязана принадлежать тому, кто пришёл: без сверки чужой
       идентификатор доказывал бы чужого хозяина. */
    if (proved.payload.accountId !== input.account.id) {
      await logSecurity({
        event: 'auth.suspicious_activity',
        phone: input.account.phone,
        ip: input.ip,
        accountId: input.account.id,
        data: { reason: 'PHONE_PROOF_MISMATCH' },
      });
      return { ok: false, problem: 'CODE_INVALID' };
    }
  } else {
    const pin = String(input.pin ?? '');
    const good = pin ? await verifyPin(pin, input.account.pinHash) : false;
    await noteLogin(input.account.phone, input.ip, good);
    if (!good) return { ok: false, problem: 'WRONG_PIN' };
  }

  const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.phone, phone));
  if (taken) return { ok: false, problem: 'PHONE_TAKEN' };

  const started = await startChallenge({
    purpose: 'phone_change',
    phone,
    accountId: input.account.id,
    ip: input.ip,
    payload: { accountId: input.account.id, phone },
    locale: input.locale,
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  return {
    ok: true,
    challengeId: started.challengeId,
    phone,
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

export type PhoneFinish =
  | { ok: true; phone: string }
  | { ok: false; problem: PhoneProblem };

/**
 * Шаг второй: код с нового номера. Здесь номер и меняется.
 *
 * После смены гаснут все сессии и стирается список знакомых устройств:
 * логин изменился, и всё, что было выдано под прежний, больше не
 * действует. Тот, кто менял номер, выйдет вместе со всеми — это не
 * побочный эффект, а ровно то, чего ждут от смены логина.
 */
export async function finishPhoneChange(input: {
  account: Pick<Account, 'id' | 'phone'>;
  tenantId: string;
  userId: string;
  challengeId: string;
  code: string;
  ip: string | null;
}): Promise<PhoneFinish> {
  const verified = await verifyChallenge<{ accountId: string; phone: string }>({
    challengeId: input.challengeId,
    code: String(input.code ?? '').trim(),
    purpose: 'phone_change',
    ip: input.ip,
  });

  if (!verified.ok) {
    return {
      ok: false,
      problem:
        verified.reason === 'EXPIRED'
          ? 'CODE_EXPIRED'
          : verified.reason === 'TOO_MANY_TRIES'
            ? 'CODE_TOO_MANY'
            : 'CODE_INVALID',
    };
  }

  /* Заявка обязана принадлежать тому, кто пришёл. Без этой строки чужой
     `challengeId` менял бы номер у чужого аккаунта. */
  if (verified.payload.accountId !== input.account.id) {
    await logSecurity({
      event: 'auth.suspicious_activity',
      phone: input.account.phone,
      ip: input.ip,
      accountId: input.account.id,
      data: { reason: 'PHONE_CHANGE_MISMATCH' },
    });
    return { ok: false, problem: 'CODE_INVALID' };
  }

  const next = verified.challenge.phone;

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(accounts)
        .set({ phone: next ?? '', phoneVerifiedAt: new Date() })
        .where(eq(accounts.id, input.account.id));
      // копия в users, пока схема обязана оставаться совместимой
      await tx.update(users).set({ phone: next ?? '' }).where(eq(users.accountId, input.account.id));
    });
  } catch {
    /* Номер заняли между отправкой кода и его вводом — уникальный
       индекс единственное, что здесь надёжно. */
    return { ok: false, problem: 'PHONE_TAKEN' };
  }

  await revokeAccountSessions(input.account.id);
  await forgetDevices(input.account.id);

  await logSecurity({
    event: 'auth.phone.changed',
    phone: next,
    accountId: input.account.id,
    tenantId: input.tenantId,
    userId: input.userId,
    ip: input.ip,
  });

  return { ok: true, phone: next ?? '' };
}
