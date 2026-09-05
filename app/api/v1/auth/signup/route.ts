import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginRegistration, type RegisterProblem } from '@/lib/auth-password';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str, type ApiError } from '@/lib/api/respond';

/**
 * Регистрация из приложения: проверить всё и выслать письмо.
 *
 * Отдельный маршрут, а не переделанный `auth/register`. Тот принимает
 * телефон и PIN и остаётся жить, пока в магазине висит 1.2: сломать его
 * значит сломать регистрацию у тех, кто ещё не обновился.
 *
 * В базе после этого запроса не появляется ничего, кроме заявки на час.
 * Мойка заводится только после перехода по ссылке из письма — иначе
 * регистрация превращается в фабрику мусорных бизнесов, а занятые адреса
 * копятся от людей, которые до почты так и не дошли.
 *
 * Ссылку открывает браузер, а не приложение: подтверждение живёт на
 * вебе (`/auth/confirm`), и это правильно — письмо и так открывают в
 * почтовом клиенте. Приложению остаётся показать «проверьте почту» и
 * ждать, когда человек вернётся и войдёт паролем.
 *
 * «Адрес занят» отдаётся честно, как и на вебе: человек, который правда
 * владеет ящиком, обязан узнать, что аккаунт у него уже есть, а не
 * получить письмо с непонятной ссылкой.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{
      niche?: string;
      businessName?: string;
      ownerName?: string;
      email?: string;
      password?: string;
      /** валюта мойки: выбирается при заведении и потом не меняется */
      currency?: string;
      /** телефон владельца: связь, а не вход */
      phone?: string;
      country?: string;
      locale?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const started = await beginRegistration(
      {
        niche: str(input.niche),
        businessName: str(input.businessName),
        ownerName: str(input.ownerName),
        email: str(input.email),
        password: str(input.password),
        currency: str(input.currency) || undefined,
        /* Заявку завело приложение. После подтверждения человека вернут
           в него, а не оставят в браузере с открытым кабинетом. */
        fromApp: true,
        phone: str(input.phone),
        countryCode: str(input.country) || undefined,
        locale: resolveLocale({
          chosen: str(input.locale) || null,
          header: request.headers.get('accept-language'),
        }),
      },
      { ip: clientIp(request.headers), agent: request.headers.get('user-agent') },
    );

    if (started.ok) {
      return ok({ email: started.email, expiresAt: started.expiresAt.toISOString() });
    }

    if (started.problem === 'THROTTLED') {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
    }

    /* Причина отказа уходит наружу кодом, а текст подбирает приложение:
       на телефоне он на языке интерфейса, и сервер о нём не знает. */
    return fail(code(started.problem), 400);
  } catch (e) {
    return failFromError(e);
  }
}

/** Беда из словаря входа — в код ответа приложения. */
function code(problem: RegisterProblem): ApiError {
  switch (problem) {
    case 'EMAIL':
      return 'EMAIL_INVALID';
    case 'EMAIL_TAKEN':
      return 'EMAIL_TAKEN';
    case 'PHONE':
      return 'PHONE_INVALID';
    case 'PHONE_TAKEN':
      return 'PHONE_TAKEN';
    case 'PASSWORD_SHORT':
      return 'PASSWORD_SHORT';
    case 'PASSWORD_COMMON':
      return 'PASSWORD_COMMON';
    case 'MAIL_FAILED':
      return 'MAIL_FAILED';
    case 'NICHE':
      return 'NICHE_INVALID';
    default:
      return 'BAD_REQUEST';
  }
}
