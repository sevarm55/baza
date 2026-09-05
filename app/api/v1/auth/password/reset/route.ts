import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { beginPasswordReset } from '@/lib/auth-password';
import { resolveLocale } from '@/lib/i18n';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * «Забыл пароль» из приложения: выслать письмо со ссылкой.
 *
 * Ответ здесь всегда один и тот же — «письмо ушло». Есть такой адрес или
 * нет, подтверждён он или нет, отключён аккаунт или жив: экран не
 * меняется. Иначе форма восстановления превращается в справочник
 * зарегистрированных ящиков, а открыта она без всякого входа.
 *
 * Новый пароль человек задаёт на вебе, по ссылке из письма
 * (`/auth/reset`), и в приложение возвращается уже с ним. Тащить сюда
 * второй экран ввода пароля незачем: ссылку всё равно открывает почтовый
 * клиент, то есть браузер.
 *
 * Отдельный маршрут, а не переделанный `auth/pin/reset`: тот
 * восстанавливает шестизначный код и остаётся жить, пока в магазине
 * висит 1.2.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ email?: string; locale?: string }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const started = await beginPasswordReset({
      email: str(input.email),
      ip: clientIp(request.headers),
      agent: request.headers.get('user-agent'),
      locale: resolveLocale({
        chosen: str(input.locale) || null,
        header: request.headers.get('accept-language'),
      }),
    });

    /* Единственный отказ, который виден снаружи, — «слишком часто». Он
       про самого просящего, а не про чужой ящик, и потому не выдаёт
       ничего. */
    if (!started.ok) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
    }

    return ok({ sent: true });
  } catch (e) {
    return failFromError(e);
  }
}
