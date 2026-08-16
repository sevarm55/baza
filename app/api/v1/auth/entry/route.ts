import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginEntry } from '@/lib/auth-flow';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Главный вход: телефон и код из SMS, без PIN.
 *
 * Одна дверь и для входа, и для регистрации. Различать их до кода
 * нельзя: как только ответ на знакомый номер отличается от ответа на
 * незнакомый, форма превращается в справочник зарегистрированных. Здесь
 * ответ один и тот же всегда — даже на невозможный номер, только SMS
 * тогда никуда не уходит.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ phone?: string; country?: string; locale?: string }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const phone = str(input.phone);
    if (!phone) return fail('BAD_REQUEST', 400);

    const started = await beginEntry({
      phone,
      countryCode: str(input.country) || undefined,
      ip: clientIp(request.headers),
      agent: request.headers.get('user-agent'),
      locale: resolveLocale({
        chosen: str(input.locale) || null,
        header: request.headers.get('accept-language'),
      }),
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
