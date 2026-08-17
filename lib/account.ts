import { eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { accounts, loginAttempts, tenants, users, type Account } from './db/schema';
import { hasPin, verifyPin } from './pin';
import { checkLogin, noteLogin } from './login-guard';
import { startChallenge, verifyChallenge } from './otp';
import { logSecurity } from './security-log';

/**
 * Удаление бизнеса.
 *
 * Одна строка в `tenants` тянет за собой всё: сотрудников, услуги,
 * клиентов, записи, абонементы, выплаты, сессии и журнал. Так устроена
 * схема — `ON DELETE CASCADE` стоит на каждой таблице, и перечислять их
 * здесь руками не нужно. Это важнее, чем кажется: список таблиц растёт,
 * и написанный от руки он однажды отстанет, оставив в базе сирот с
 * чужими данными.
 *
 * Отдельного удаления аккаунта сотрудника нет и не планируется: его
 * заводит и отключает владелец, своей учётной записью работник не
 * распоряжается. Здесь он исчезает вместе с бизнесом.
 *
 * Что каскад не заберёт — попытки входа: они привязаны к телефону, а не
 * к бизнесу, потому что копятся ещё до того, как аккаунт существует.
 * Их нужно убрать явно, иначе выйдет ловушка: владелец несколько раз
 * промахнулся PIN-ом, удалил бизнес, регистрируется тем же номером
 * заново — и упирается в блокировку от аккаунта, которого больше нет.
 */
/* ------------------- чем подтверждают удаление ------------------- */

/**
 * Удаление бизнеса подтверждают дважды разными вещами, и вторая зависит
 * от того, что у человека вообще есть.
 *
 * Первая — живая сессия. Её мало: телефон лежит на мойке
 * разблокированным, и между «зашёл посмотреть выручку» и «стёр всё»
 * обязано стоять что-то, чего случайный человек рядом не знает.
 *
 * Вторая — PIN. Но у заведённых по SMS его нет вовсе: `pin_hash` у них
 * помечен «кода нет», и `verifyPin` отказывает всегда. Пока подтверждение
 * было только одно, такой владелец не мог удалить свой бизнес НИКОГДА —
 * ни с сайта, ни с телефона. Выход сложнее входа, а данные заперты у нас;
 * ни то ни другое не должно существовать.
 *
 * Поэтому у второго подтверждения два вида, и выбирает не клиент, а
 * состояние аккаунта: есть код — спрашиваем код, нет — высылаем SMS на
 * тот самый номер, которым человек и входит. Присланный клиентом признак
 * «у меня нет PIN» здесь был бы способом обойти PIN, поэтому решает
 * только `hasPin` по базе.
 */
export function deleteNeedsCode(account: Pick<Account, 'pinHash'>): boolean {
  return !hasPin(account.pinHash);
}

export type DeleteChallenge =
  | { ok: true; challengeId: string; resendAt: Date; expiresAt: Date }
  | { ok: false; problem: 'THROTTLED' | 'SMS_FAILED'; retryAfter?: number };

/** Выслать код подтверждения на номер аккаунта. */
export async function startDeleteCode(input: {
  account: Pick<Account, 'id' | 'phone'>;
  ip: string | null;
  locale?: string;
}): Promise<DeleteChallenge> {
  const started = await startChallenge({
    purpose: 'account_delete',
    phone: input.account.phone,
    accountId: input.account.id,
    ip: input.ip,
    payload: { accountId: input.account.id },
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

export type DeleteProof =
  | { ok: true }
  | {
      ok: false;
      problem:
        /** кода нет и PIN нет: сначала выслать SMS */
        | 'NEED_CODE'
        | 'WRONG_PIN'
        | 'THROTTLED'
        | 'CODE_INVALID'
        | 'CODE_EXPIRED'
        | 'CODE_TOO_MANY';
      retryAfter?: number;
    };

/**
 * Проверить подтверждение.
 *
 * Счётчик попыток тот же, что на входе, и это не перестраховка: без него
 * форма удаления становится тихим способом подобрать PIN владельца
 * изнутри уже открытой сессии — без блокировки и без следа в истории
 * входов.
 *
 * Заявка обязана принадлежать тому, кто пришёл. Без сверки `accountId`
 * чужой идентификатор заявки подтверждал бы удаление чужого бизнеса.
 */
export async function checkDeleteProof(input: {
  account: Pick<Account, 'id' | 'phone' | 'pinHash'>;
  ip: string | null;
  pin?: string;
  challengeId?: string;
  code?: string;
}): Promise<DeleteProof> {
  const guard = await checkLogin(input.account.phone, input.ip);
  if (!guard.allowed) return { ok: false, problem: 'THROTTLED', retryAfter: guard.retryAfter };

  if (deleteNeedsCode(input.account)) {
    if (!input.challengeId) return { ok: false, problem: 'NEED_CODE' };

    const verified = await verifyChallenge<{ accountId?: string }>({
      challengeId: input.challengeId,
      code: String(input.code ?? ''),
      purpose: 'account_delete',
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

    if (verified.payload.accountId !== input.account.id) {
      await logSecurity({
        event: 'auth.suspicious_activity',
        phone: input.account.phone,
        ip: input.ip,
        accountId: input.account.id,
        data: { reason: 'DELETE_CHALLENGE_MISMATCH' },
      });
      return { ok: false, problem: 'CODE_INVALID' };
    }

    return { ok: true };
  }

  const pin = String(input.pin ?? '');
  const good = pin ? await verifyPin(pin, input.account.pinHash) : false;
  await noteLogin(input.account.phone, input.ip, good);
  return good ? { ok: true } : { ok: false, problem: 'WRONG_PIN' };
}

export async function deleteBusiness(tenantId: string): Promise<{ people: number }> {
  return db.transaction(async (tx) => {
    const staff = await tx
      .select({ phone: users.phone, accountId: users.accountId })
      .from(users)
      .where(eq(users.tenantId, tenantId));

    const accountIds = [...new Set(staff.map((s) => s.accountId).filter(Boolean))] as string[];
    let phones: string[] = [];

    await tx.delete(tenants).where(eq(tenants.id, tenantId));

    /* Человек переживает бизнес — но только если ему есть где остаться.
       Тот, у кого не осталось ни одного участия, уходит вместе с
       последним: иначе его номер числился бы занятым навсегда, а
       завестись заново стало бы нечем. Именно этим номер и
       освобождается.

       У кого осталась вторая мойка — остаётся и он сам, со своим кодом,
       своими устройствами и своим израсходованным пробным сроком.
       Удаление одной точки не имеет права выкидывать человека из
       другой. */
    if (accountIds.length > 0) {
      const left = await tx
        .select({ accountId: users.accountId })
        .from(users)
        .where(inArray(users.accountId, accountIds));

      const staying = new Set(left.map((r) => r.accountId));
      const gone = accountIds.filter((id) => !staying.has(id));
      if (gone.length > 0) {
        const leaving = await tx
          .select({ phone: accounts.phone })
          .from(accounts)
          .where(inArray(accounts.id, gone));
        phones = leaving.map((r) => r.phone);
        await tx.delete(accounts).where(inArray(accounts.id, gone));
      }
    }

    /* Только у тех, кто ушёл совсем. У кого осталась вторая мойка,
       счётчик неудачных входов трогать нельзя: обнулять его удалением
       соседней точки значило бы дать способ снимать защиту от перебора
       с собственного номера. */
    if (phones.length > 0) {
      await tx.delete(loginAttempts).where(inArray(loginAttempts.phone, phones));
    }

    /* Считаем участия, а не ушедших совсем: в логе интересно, сколько
       человек лишились этой мойки, а не сколько из них попрощались с
       продуктом целиком. */
    return { people: staff.length };
  });
}
