import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { accounts, users } from '@/lib/db/schema';
import { verifyPin } from '@/lib/pin';
import { isValidPhone, normalizePhone } from '@/lib/phone';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { startChallenge, verifyChallenge } from '@/lib/otp';
import { forgetDevices } from '@/lib/risk';
import { revokeAccountSessions } from '@/lib/auth';
import { logSecurity } from '@/lib/security-log';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Смена номера телефона.
 *
 * Номер — это логин. Поэтому здесь не `PATCH /profile` с полем `phone`, а
 * отдельный сценарий из двух шагов, и оба обязательны:
 *
 *   PIN            — доказать, что за экраном хозяин, а не тот, кому
 *                    оставили разблокированный телефон;
 *   код на НОВЫЙ   — доказать, что новый номер существует и принадлежит
 *   номер            ему же. Без этого сменой номера можно передать
 *                    аккаунт кому угодно, включая себя.
 *
 * После смены гаснут все сессии и стирается список знакомых устройств:
 * логин изменился, и всё, что было выдано под прежний, больше не
 * действует.
 *
 * `anyPlan`: закрыть или починить доступ к своему аккаунту можно в любом
 * состоянии счёта. Безопасность не зависит от оплаты.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const ip = clientIp(request.headers);
    const input = await body<{
      /** шаг первый */
      pin?: string;
      phone?: string;
      country?: string;
      /** шаг второй */
      challengeId?: string;
      code?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const challengeId = str(input.challengeId);

    /* ---- шаг второй: код с нового номера ---- */
    if (challengeId) {
      const verified = await verifyChallenge<{ accountId: string; phone: string }>({
        challengeId,
        code: str(input.code),
        purpose: 'phone_change',
        ip,
      });

      if (!verified.ok) {
        if (verified.reason === 'EXPIRED') return fail('OTP_EXPIRED', 410);
        if (verified.reason === 'TOO_MANY_TRIES') return fail('OTP_TOO_MANY', 429);
        return fail('OTP_INVALID', 401);
      }

      /* Заявка обязана принадлежать тому, кто пришёл. Без этой строки
         чужой `challengeId` менял бы номер у чужого аккаунта. */
      if (verified.payload.accountId !== ctx.account.id) return fail('FORBIDDEN', 403);

      const next = verified.challenge.phone;

      try {
        await db.transaction(async (tx) => {
          await tx
            .update(accounts)
            .set({ phone: next, phoneVerifiedAt: new Date() })
            .where(eq(accounts.id, ctx.account.id));
          // копия в users, пока схема обязана оставаться совместимой
          await tx.update(users).set({ phone: next }).where(eq(users.accountId, ctx.account.id));
        });
      } catch {
        /* Номер заняли между отправкой кода и его вводом — уникальный
           индекс единственное, что здесь надёжно. */
        return fail('PHONE_TAKEN', 409);
      }

      await revokeAccountSessions(ctx.account.id);
      await forgetDevices(ctx.account.id);

      await logSecurity({
        event: 'auth.phone.changed',
        phone: next,
        accountId: ctx.account.id,
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        ip,
      });

      return ok({ done: true });
    }

    /* ---- шаг первый: PIN и новый номер ---- */
    const pin = str(input.pin);
    const phone = normalizePhone(str(input.phone), str(input.country) || undefined);

    if (!pin || !phone) return fail('BAD_REQUEST', 400);
    if (!isValidPhone(phone, str(input.country) || undefined)) {
      return fail('BAD_REQUEST', 400, { reason: 'PHONE' });
    }
    if (phone === ctx.account.phone) return fail('BAD_REQUEST', 400, { reason: 'SAME_PHONE' });

    /* Тот же счётчик попыток, что на входе: иначе это тихий способ
       подобрать PIN изнутри уже открытой сессии. */
    const guard = await checkLogin(ctx.account.phone, ip);
    if (!guard.allowed) return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });

    const good = await verifyPin(pin, ctx.account.pinHash);
    await noteLogin(ctx.account.phone, ip, good);
    if (!good) return fail('WRONG_CREDENTIALS', 401);

    /* Занятость нового номера проверяем ДО отправки: слать код на
       номер, который всё равно не примут, незачем. Настоящую гарантию
       по-прежнему даёт уникальный индекс на втором шаге. */
    const [taken] = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.phone, phone));
    if (taken) return fail('PHONE_TAKEN', 409);

    const started = await startChallenge({
      purpose: 'phone_change',
      phone,
      ip,
      accountId: ctx.account.id,
      payload: { accountId: ctx.account.id, phone },
    });

    if (!started.ok) {
      if (started.reason === 'THROTTLED') {
        return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
      }
      return fail('SMS_FAILED', 503);
    }

    return ok(
      {
        challengeId: started.challengeId,
        resendAt: started.resendAt.toISOString(),
        expiresAt: started.expiresAt.toISOString(),
      },
      202,
    );
  } catch (e) {
    return failFromError(e);
  }
}
