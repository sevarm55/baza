import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { attemptLogin, noteLoginSucceeded } from '@/lib/auth-flow';
import { signalsFromHeaders } from '@/lib/risk';
import { issueSession } from '@/lib/api/session-response';
import { localeFromRequest } from '@/lib/i18n/request';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Вход приложения.
 *
 * Сценарий тот же, что у веба, и это буквально один и тот же код:
 * `attemptLogin` в `lib/auth-flow.ts`. Две копии входа разошлись бы на
 * первой правке, и разошлись бы именно в защите — там, где это заметят
 * последним.
 *
 * Отличий от веба два, и оба про транспорт: сессия здесь пара токенов, а
 * не cookie, и отпечаток устройства приложение присылает своим
 * идентификатором установки — он надёжнее заголовка браузера.
 *
 * Ответ на неверный телефон и на неверный PIN одинаковый. Время ответа
 * тоже: когда сверять нечего, сверка всё равно выполняется (см.
 * `attemptLogin`), иначе неизвестный номер отвечал бы заметно быстрее.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      phone?: string;
      pin?: string;
      device?: string;
      /** идентификатор установки: по нему узнаётся знакомое устройство */
      installId?: string;
      country?: string;
      /** язык интерфейса приложения — на нём придёт код из SMS */
      locale?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const phone = str(input.phone);
    const pin = str(input.pin);
    if (!phone || !pin) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const signals = signalsFromHeaders(request.headers, str(input.installId) || null);

    const outcome = await attemptLogin({
      phone,
      pin,
      ip,
      signals,
      countryCode: str(input.country) || undefined,
      locale: localeFromRequest(request, str(input.locale) || null),
    });

    if (outcome.kind === 'throttled') {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: outcome.retryAfter });
    }
    if (outcome.kind === 'denied') return fail('WRONG_CREDENTIALS', 401);

    if (outcome.kind === 'step_up') {
      /* 401 с собственным кодом, а не 200: вход НЕ состоялся, и клиент,
         который просто проверяет статус, не должен считать иначе.
         Экран ввода кода открывается по коду ошибки. */
      return fail('STEP_UP_REQUIRED', 401, {
        challengeId: outcome.challengeId,
        phone: outcome.phoneMasked,
        resendAt: outcome.resendAt.toISOString(),
        expiresAt: outcome.expiresAt.toISOString(),
      });
    }

    return ok(
      await issueSession({
        membership: outcome.membership,
        accountId: outcome.accountId,
        device: str(input.device) || null,
        after: () =>
          noteLoginSucceeded({
            outcome,
            phone,
            ip,
            agent: request.headers.get('user-agent'),
          }),
      }),
    );
  } catch (e) {
    return failFromError(e);
  }
}
