import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginPinReset, checkResetCode, completePinReset } from '@/lib/auth-flow';
import { localeFromRequest } from '@/lib/i18n/request';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Восстановление PIN: три шага одним маршрутом.
 *
 *   POST { phone }                 → заявка и код на телефон
 *   POST { challengeId, code }     → пропуск на смену
 *   POST { ticket, pin }           → новый PIN
 *
 * Три шага, а не три маршрута: это один сценарий, и разнеси его по
 * файлам — придётся трижды писать одни и те же проверки. Шаг
 * определяется тем, что прислали, а не отдельным полем: набор полей у
 * шагов не пересекается.
 *
 * ЧЕГО ЗДЕСЬ НЕТ. Старый PIN не возвращается ни при каких условиях — из
 * хеша его достать нельзя, и это правильно. Ответ на первом шаге
 * одинаковый для существующего и несуществующего номера: форма
 * восстановления открыта без входа, и разница в ответах превратила бы
 * её в справочник зарегистрированных.
 *
 * После смены гаснут все сессии человека и стирается список знакомых
 * устройств. Второе не менее важно: если аккаунт уводили, у уводившего
 * могло остаться записанное «знакомое» устройство.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ip = clientIp(request.headers);
    const agent = request.headers.get('user-agent');

    const input = await body<{
      phone?: string;
      country?: string;
      challengeId?: string;
      code?: string;
      ticket?: string;
      pin?: string;
      locale?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const ticket = str(input.ticket);
    const challengeId = str(input.challengeId);
    const phone = str(input.phone);

    /* ---- шаг третий: новый PIN ---- */
    if (ticket) {
      const done = await completePinReset({ ticket, pin: str(input.pin), ip, agent });
      if (!done.ok) {
        if (done.problem === 'TICKET_INVALID') return fail('OTP_EXPIRED', 410);
        return fail('PIN_WEAK', 400, { reason: done.problem });
      }
      /* Сессию не выдаём намеренно: человек назначил новый код — пусть
         войдёт им. Иначе восстановление становится вторым способом
         войти, со своими правилами, и защищать его придётся отдельно. */
      return ok({ done: true });
    }

    /* ---- шаг второй: код ---- */
    if (challengeId) {
      const checked = await checkResetCode({ challengeId, code: str(input.code), ip });
      if (!checked.ok) {
        if (checked.problem === 'OTP_EXPIRED') return fail('OTP_EXPIRED', 410);
        if (checked.problem === 'OTP_TOO_MANY') return fail('OTP_TOO_MANY', 429);
        return fail('OTP_INVALID', 401);
      }
      return ok({ ticket: checked.ticket });
    }

    /* ---- шаг первый: телефон ---- */
    if (!phone) return fail('BAD_REQUEST', 400);

    const started = await beginPinReset({
      phone,
      countryCode: str(input.country) || undefined,
      ip,
      agent,
      locale: localeFromRequest(request, str(input.locale) || null),
    });

    if (!started.ok) {
      if (started.problem === 'THROTTLED') {
        return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
      }
      return fail('SMS_FAILED', 503);
    }

    return ok({
      challengeId: started.challengeId,
      phone: started.phoneMasked,
      resendAt: started.resendAt.toISOString(),
      expiresAt: started.expiresAt.toISOString(),
    });
  } catch (e) {
    return failFromError(e);
  }
}
