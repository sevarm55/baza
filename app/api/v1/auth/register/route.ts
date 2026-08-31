import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginRegistration } from '@/lib/auth-flow';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Первый шаг регистрации из приложения: проверка и код на телефон.
 *
 * ЧТО ИЗМЕНИЛОСЬ. Раньше этот маршрут создавал бизнес сразу и отдавал
 * токены. Теперь он не создаёт ничего: в базе появляется только заявка
 * на десять минут, а бизнес заводит второй шаг — после кода из SMS.
 *
 * Разница не в удобстве. Без подтверждения номер можно занять чужой:
 * заводишь аккаунт на номер владельца мойки раньше него, и он уже не
 * зарегистрируется никогда, а восстановление доступа приведёт к тебе.
 * Заодно исчезает фабрика мусорных бизнесов — сто запросов сюда больше
 * не создают ста тенантов.
 *
 * Ниша проверяется на сервере, а не только в интерфейсе: маршрут открыт
 * наружу, и выключенную нишу нельзя дать завести прямым запросом.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      niche?: string;
      businessName?: string;
      ownerName?: string;
      currency?: string;
      phone?: string;
      pin?: string;
      country?: string;
      locale?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const started = await beginRegistration(
      {
        niche: str(input.niche),
        businessName: str(input.businessName),
        ownerName: str(input.ownerName),
        currency: str(input.currency) || undefined,
        phone: str(input.phone),
        pin: str(input.pin),
        countryCode: str(input.country) || undefined,
        locale: resolveLocale({ chosen: str(input.locale) || null, header: request.headers.get('accept-language') }),
      },
      { ip: clientIp(request.headers), agent: request.headers.get('user-agent') },
    );

    if (!started.ok) {
      switch (started.problem) {
        case 'PHONE_TAKEN':
          return fail('PHONE_TAKEN', 409);
        case 'PIN_LENGTH':
        case 'PIN_TRIVIAL':
          return fail('PIN_WEAK', 400, { reason: started.problem });
        case 'PHONE':
          return fail('BAD_REQUEST', 400, { reason: 'PHONE' });
        case 'NAME':
          return fail('BAD_REQUEST', 400, { reason: 'NAME' });
        case 'NICHE':
          return fail('BAD_REQUEST', 400, { reason: 'NICHE' });
        case 'THROTTLED':
          return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
        case 'SMS_FAILED':
          return fail('SMS_FAILED', 503);
      }
    }

    return ok(
      {
        challengeId: started.challengeId,
        phone: started.phoneMasked,
        resendAt: started.resendAt.toISOString(),
        expiresAt: started.expiresAt.toISOString(),
      },
      /* 202: заявка принята, аккаунта ещё нет. Прежний ответ был 201
         «создано» — сборка, которая ждёт именно 201, честно узнает, что
         ничего не создано. */
      202,
    );
  } catch (e) {
    return failFromError(e);
  }
}
