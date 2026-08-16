import { pickAuthLocale, type AuthLocale } from './auth';

/**
 * Язык клиента для запроса к API.
 *
 * Приложение присылает своё поле `locale`: у него нет наших cookie, а
 * язык интерфейса выбирается системой телефона, а не браузером. Не
 * прислало — берём `Accept-Language`, который iOS ставит сам. Не подошло
 * и это — армянский.
 *
 * Нужно ровно для одного: код из SMS должен прийти на том языке, на
 * котором человек видит приложение. Мелочь, которая заметна: получить
 * армянское «никому не сообщайте» на русском интерфейсе — то же самое,
 * что получить его на суахили.
 */
export function localeFromRequest(request: Request, fromBody?: string | null): AuthLocale {
  return pickAuthLocale({
    cookie: fromBody ?? null,
    acceptLanguage: request.headers.get('accept-language'),
  });
}
