import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { completeStepUp } from '@/lib/auth-flow';
import { issueSession } from '@/lib/api/session-response';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Досдать код при входе с незнакомого устройства.
 *
 * Сюда приложение попадает после `STEP_UP_REQUIRED` от `/auth/login`:
 * PIN уже подошёл, осталось доказать, что телефон в руках у того же
 * человека. Успех означает и вход, и запоминание устройства — со
 * второго раза кода на нём не спросят.
 *
 * Телефон и PIN здесь заново не спрашиваются, и это не дыра: заявка
 * заведена сервером именно под тот аккаунт, чей код подошёл, и человек
 * в ней прописан. Прислать чужой `challengeId` бесполезно — код к нему
 * приходит на чужой телефон.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ challengeId?: string; code?: string; device?: string }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const challengeId = str(input.challengeId);
    const code = str(input.code);
    if (!challengeId || !code) return fail('BAD_REQUEST', 400);

    const result = await completeStepUp({
      challengeId,
      code,
      ip: clientIp(request.headers),
      agent: request.headers.get('user-agent'),
    });

    if (result.kind === 'otp') {
      if (result.reason === 'EXPIRED') return fail('OTP_EXPIRED', 410);
      if (result.reason === 'TOO_MANY_TRIES') return fail('OTP_TOO_MANY', 429);
      return fail('OTP_INVALID', 401);
    }
    if (result.kind !== 'ok') return fail('WRONG_CREDENTIALS', 401);

    return ok(
      await issueSession({
        membership: result.membership,
        accountId: result.accountId,
        device: str(input.device) || null,
      }),
    );
  } catch (e) {
    return failFromError(e);
  }
}
