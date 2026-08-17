import { ensureDb } from '@/lib/db/ready';
import { maskPhone } from '@/lib/phone';
import { clientIp } from '@/lib/login-guard';
import {
  changeNeedsCode,
  finishPhoneChange,
  startPhoneChange,
  startSelfProof,
  type PhoneProblem,
} from '@/lib/phone-change';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Смена номера телефона.
 *
 * Правила живут в `lib/phone-change.ts` — тем же кодом их применяет
 * кабинет. Здесь только разбор запроса и коды ответов: маршрут не имеет
 * права решать, чем доказывают хозяина, иначе у приложения и сайта
 * заведутся разные ответы на один вопрос.
 *
 * Четыре возможных запроса:
 *
 *   POST { }                           → код на СВОЙ (у кого нет PIN)
 *   POST { pin, phone }                → код на новый номер
 *   POST { proofId, proofCode, phone } → код на новый номер
 *   POST { challengeId, code }         → номер сменён
 *
 * `anyPlan`: починить доступ к своему аккаунту можно в любом состоянии
 * счёта. Безопасность не зависит от оплаты.
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
      /** доказательство кодом на свой номер — у кого нет PIN */
      proofId?: string;
      proofCode?: string;
      /** шаг второй */
      challengeId?: string;
      code?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const challengeId = str(input.challengeId);

    /* ---- шаг второй: код с нового номера ---- */
    if (challengeId) {
      const done = await finishPhoneChange({
        account: ctx.account,
        tenantId: ctx.tenant.id,
        userId: ctx.user.id,
        challengeId,
        code: str(input.code),
        ip,
      });

      return done.ok ? ok({ done: true }) : answer(done.problem);
    }

    /* ---- нулевой шаг: код на свой номер, у кого нет PIN ---- */
    if (changeNeedsCode(ctx.account) && !str(input.proofId)) {
      const started = await startSelfProof({ account: ctx.account, ip, locale: ctx.locale });
      if (!started.ok) return answer(started.problem, started.retryAfter);

      return ok(
        {
          proofId: started.challengeId,
          phone: maskPhone(ctx.account.phone),
          resendAt: started.resendAt.toISOString(),
          expiresAt: started.expiresAt.toISOString(),
        },
        202,
      );
    }

    /* ---- шаг первый: доказать себя и назвать новый номер ---- */
    const started = await startPhoneChange({
      account: ctx.account,
      phone: str(input.phone),
      country: str(input.country) || undefined,
      pin: str(input.pin),
      proofId: str(input.proofId),
      proofCode: str(input.proofCode),
      ip,
      locale: ctx.locale,
    });

    if (!started.ok) return answer(started.problem, started.retryAfter);

    return ok(
      {
        challengeId: started.challengeId,
        phone: maskPhone(started.phone),
        resendAt: started.resendAt.toISOString(),
        expiresAt: started.expiresAt.toISOString(),
      },
      202,
    );
  } catch (e) {
    return failFromError(e);
  }
}

/** Отказ модуля — в код ответа. Один разбор на оба шага. */
function answer(problem: PhoneProblem, retryAfter?: number) {
  switch (problem) {
    case 'NEED_PROOF':
      return fail('BAD_REQUEST', 400, { reason: 'NEED_PROOF' });
    case 'BAD_PHONE':
      return fail('BAD_REQUEST', 400, { reason: 'PHONE' });
    case 'SAME_PHONE':
      return fail('BAD_REQUEST', 400, { reason: 'SAME_PHONE' });
    case 'PHONE_TAKEN':
      return fail('PHONE_TAKEN', 409);
    case 'WRONG_PIN':
      return fail('WRONG_CREDENTIALS', 401);
    case 'THROTTLED':
      return fail('TOO_MANY_TRIES', 429, { retryAfter });
    case 'CODE_EXPIRED':
      return fail('OTP_EXPIRED', 410);
    case 'CODE_TOO_MANY':
      return fail('OTP_TOO_MANY', 429);
    case 'CODE_INVALID':
      return fail('OTP_INVALID', 401);
    case 'SMS_FAILED':
      return fail('SMS_FAILED', 503);
  }
}
