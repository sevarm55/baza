import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginPhoneProof, completePhoneProof } from '@/lib/auth-flow';
import { authorize, denied } from '@/lib/api/guard';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Подтвердить СВОЙ номер уже после входа.
 *
 * Для тех, кто зарегистрировался до появления кода из SMS. Их номера
 * помечены неподтверждёнными, и это значит ровно одно: восстановить PIN
 * по SMS они не могут — иначе восстановление само стало бы способом
 * забрать чужой непроверенный аккаунт.
 *
 * Требовать подтверждение силой нельзя: остановить владельцу мойку
 * посреди рабочего дня из-за нашего переезда — не тот размен.
 * Предлагается в кабинете, отказ ничего не ломает, вернуться можно
 * когда угодно.
 *
 *   POST {}                     → код на номер аккаунта
 *   POST { challengeId, code }  → номер подтверждён
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const ip = clientIp(request.headers);
    const input = (await body<{ challengeId?: string; code?: string; locale?: string }>(request)) ?? {};
    const challengeId = str(input.challengeId);

    if (challengeId) {
      const done = await completePhoneProof({
        challengeId,
        code: str(input.code),
        accountId: ctx.account.id,
        ip,
      });
      return done ? ok({ verified: true }) : fail('OTP_INVALID', 401);
    }

    if (ctx.account.phoneVerifiedAt) return ok({ verified: true });

    const started = await beginPhoneProof({
      accountId: ctx.account.id,
      phone: ctx.account.phone,
      ip,
      locale: resolveLocale({ chosen: str(input.locale) || null, header: request.headers.get('accept-language') }),
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
