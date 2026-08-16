import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { completeRegistration } from '@/lib/auth-flow';
import { signalsFromHeaders } from '@/lib/risk';
import { issueSession } from '@/lib/api/session-response';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Второй шаг регистрации: код сошёлся — бизнес создан, человек внутри.
 *
 * Вход отдельным действием после этого не нужен: телефон и PIN человек
 * только что ввёл, и просить их снова значит спрашивать то, что мы уже
 * знаем.
 *
 * Устройство запоминается сразу, внутри `completeRegistration`: человек
 * доказал владение номером минуту назад, и просить код ещё раз при
 * первом же входе было бы издевательством.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      challengeId?: string;
      code?: string;
      device?: string;
      installId?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const challengeId = str(input.challengeId);
    const code = str(input.code);
    if (!challengeId || !code) return fail('BAD_REQUEST', 400);

    const done = await completeRegistration({
      challengeId,
      code,
      ip: clientIp(request.headers),
      signals: signalsFromHeaders(request.headers, str(input.installId) || null),
    });

    if (!done.ok) {
      switch (done.problem) {
        case 'OTP_EXPIRED':
          return fail('OTP_EXPIRED', 410);
        case 'OTP_TOO_MANY':
          return fail('OTP_TOO_MANY', 429);
        case 'PHONE_TAKEN':
          return fail('PHONE_TAKEN', 409);
        default:
          return fail('OTP_INVALID', 401);
      }
    }

    return ok(
      await issueSession({
        membership: { id: done.ownerId, tenantId: done.tenantId, role: 'owner' },
        accountId: done.accountId || null,
        device: str(input.device) || null,
      }),
      201,
    );
  } catch (e) {
    return failFromError(e);
  }
}
