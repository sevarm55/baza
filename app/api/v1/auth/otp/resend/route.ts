import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { resend } from '@/lib/auth-flow';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Выслать код повторно.
 *
 * Один маршрут на все поводы: заявка сама знает, зачем её заводили.
 * Пауза между отправками растёт (45 → 90 → 180 секунд), число повторов
 * ограничено, и то и другое считает СЕРВЕР. Обратный отсчёт в
 * приложении — подсказка человеку, а не правило: правило здесь.
 *
 * Отказ по паузе — 429 с числом секунд, а не молчание: экран обязан
 * показать, сколько ещё ждать.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ challengeId?: string }>(request);
    const challengeId = str(input?.challengeId);
    if (!challengeId) return fail('BAD_REQUEST', 400);

    const again = await resend({ challengeId, ip: clientIp(request.headers) });

    if (!again.ok) {
      if (again.reason === 'SEND_FAILED') return fail('SMS_FAILED', 503);
      return fail('TOO_MANY_TRIES', 429, { retryAfter: again.retryAfter });
    }

    return ok({
      challengeId: again.challengeId,
      resendAt: again.resendAt.toISOString(),
      expiresAt: again.expiresAt.toISOString(),
      resendsLeft: again.resendsLeft,
    });
  } catch (e) {
    return failFromError(e);
  }
}
