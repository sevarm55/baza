import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import {
  attemptLogin as attemptPinLogin,
  noteLoginSucceeded as notePinSucceeded,
} from '@/lib/auth-flow';
import { attemptLogin, noteLoginSucceeded } from '@/lib/auth-password';
import { signalsFromHeaders } from '@/lib/risk';
import { issueSession } from '@/lib/api/session-response';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Вход приложения.
 *
 * Сценарий тот же, что у веба, и это буквально один и тот же код:
 * `attemptLogin` в `lib/auth-password.ts`. Две копии входа разошлись бы на
 * первой правке, и разошлись бы именно в защите — там, где это заметят
 * последним.
 *
 * Логин у владельца — почта, у сотрудника — телефон; какой перед нами,
 * решает сам `attemptLogin`, а не приложение. Поэтому здесь одно поле
 * `login`, а не два, и роль приходит в ответе, а не спрашивается заранее.
 *
 * Отличий от веба два, и оба про транспорт: сессия здесь пара токенов, а
 * не cookie, и отпечаток устройства приложение присылает своим
 * идентификатором установки — он надёжнее заголовка браузера.
 *
 * ДВА ТЕЛА ЗАПРОСА, и это не небрежность. В магазине живёт 1.2, которая
 * шлёт сюда телефон и шестизначный PIN. Переключить маршрут на пароль
 * одним движением значит запереть снаружи всех, кто ещё не обновился, — в
 * тот же час, без предупреждения. Поэтому: пришёл `password` — новый
 * путь, пришёл `pin` — прежний. Второй уходит вместе со стеной
 * обновления, когда 1.2 перестанет быть живой.
 *
 * Ответ на неверный логин и на неверный пароль одинаковый. Время ответа
 * тоже: когда сверять нечего, сверка всё равно выполняется (см.
 * `attemptLogin`), иначе незнакомая почта отвечала бы заметно быстрее и
 * становилась бы способом перебрать адреса.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      /** почта владельца или телефон сотрудника */
      login?: string;
      password?: string;
      /** прежний путь: только для сборок до перехода на пароль */
      phone?: string;
      pin?: string;
      device?: string;
      /** идентификатор установки: по нему узнаётся знакомое устройство */
      installId?: string;
      country?: string;
      /** язык интерфейса приложения */
      locale?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const agent = request.headers.get('user-agent');
    const signals = signalsFromHeaders(request.headers, str(input.installId) || null);
    const country = str(input.country) || undefined;
    const device = str(input.device) || null;

    const login = str(input.login);
    const password = str(input.password);

    if (login && password) {
      const outcome = await attemptLogin({ login, password, ip, signals, countryCode: country });

      if (outcome.kind === 'throttled') {
        return fail('TOO_MANY_TRIES', 429, { retryAfter: outcome.retryAfter });
      }
      if (outcome.kind === 'denied') return fail('WRONG_CREDENTIALS', 401);

      /* Знакомое устройство запоминает сам `attemptLogin`: отпечаток
         считается там же, где принимается решение, и route.ts об этом
         знать не обязан. */
      return ok(
        await issueSession({
          membership: outcome.membership,
          accountId: outcome.accountId,
          device,
          after: () => noteLoginSucceeded({ outcome, login, ip, agent }),
        }),
      );
    }

    /* ---------- прежний путь: телефон и PIN, ради живых 1.2 ---------- */

    const phone = str(input.phone);
    const pin = str(input.pin);
    if (!phone || !pin) return fail('BAD_REQUEST', 400);

    const outcome = await attemptPinLogin({
      phone,
      pin,
      ip,
      signals,
      countryCode: country,
      locale: resolveLocale({
        chosen: str(input.locale) || null,
        header: request.headers.get('accept-language'),
      }),
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
        device,
        after: () => notePinSucceeded({ outcome, phone, ip, agent }),
      }),
    );
  } catch (e) {
    return failFromError(e);
  }
}
