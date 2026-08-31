import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { completeEntry, completeSignUp } from '@/lib/auth-flow';
import { signalsFromHeaders } from '@/lib/risk';
import { issueSession } from '@/lib/api/session-response';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Второй шаг главного входа — и третий, если человек новый.
 *
 *   POST { challengeId, code }                      → внутрь или пропуск
 *   POST { ticket, niche, businessName, ownerName } → мойка создана
 *
 * Два шага одним маршрутом, потому что это один сценарий: между ними
 * человек только вводит название. Шаг определяется тем, что прислали.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      challengeId?: string;
      code?: string;
      ticket?: string;
      niche?: string;
      businessName?: string;
      ownerName?: string;
      currency?: string;
      device?: string;
      installId?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const signals = signalsFromHeaders(request.headers, str(input.installId) || null);
    const ticket = str(input.ticket);

    /* ---- новичок назвал мойку ---- */
    if (ticket) {
      const made = await completeSignUp({
        ticket,
        niche: str(input.niche),
        businessName: str(input.businessName),
        ownerName: str(input.ownerName),
        currency: str(input.currency) || undefined,
        ip,
        signals,
      });

      if (!made.ok) {
        if (made.problem === 'PHONE_TAKEN') return fail('PHONE_TAKEN', 409);
        if (made.problem === 'TICKET_INVALID') return fail('OTP_EXPIRED', 410);
        return fail('BAD_REQUEST', 400, { reason: made.problem });
      }

      return ok(
        await issueSession({
          membership: { id: made.ownerId, tenantId: made.tenantId, role: 'owner' },
          accountId: made.accountId || null,
          device: str(input.device) || null,
        }),
        201,
      );
    }

    /* ---- код ---- */
    const challengeId = str(input.challengeId);
    if (!challengeId) return fail('BAD_REQUEST', 400);

    const done = await completeEntry({ challengeId, code: str(input.code), ip, signals });

    if (done.kind === 'otp') {
      if (done.reason === 'EXPIRED') return fail('OTP_EXPIRED', 410);
      if (done.reason === 'TOO_MANY_TRIES') return fail('OTP_TOO_MANY', 429);
      return fail('OTP_INVALID', 401);
    }
    if (done.kind === 'denied') return fail('WRONG_CREDENTIALS', 401);

    /* Номер свободен: аккаунта пока нет, отдаём пропуск на создание.
       Токенов здесь нет и быть не может — заходить ещё некуда. */
    if (done.kind === 'new') return ok({ ticket: done.ticket });

    return ok(
      await issueSession({
        membership: done.membership,
        accountId: done.accountId,
        device: str(input.device) || null,
      }),
    );
  } catch (e) {
    return failFromError(e);
  }
}
