import { authHy, type AuthDict } from './auth-hy';
import { authRu } from './auth-ru';
import { authEn } from './auth-en';

export type { AuthDict };

/**
 * Языки авторизации.
 *
 * Авторизация — единственная часть продукта, которую человек видит до
 * того, как мы вообще что-либо о нём знаем, поэтому она обязана
 * существовать на всех трёх сразу. Кабинет пока живёт на армянском: его
 * перевод — отдельная работа того же размера, что весь этот файл ×20, и
 * смешивать её с безопасностью входа значит не сделать ни того, ни
 * другого.
 */
export const AUTH_DICTS = { hy: authHy, ru: authRu, en: authEn } satisfies Record<
  string,
  AuthDict
>;

export type AuthLocale = keyof typeof AUTH_DICTS;

export const AUTH_LOCALES = Object.keys(AUTH_DICTS) as AuthLocale[];

export const DEFAULT_AUTH_LOCALE: AuthLocale = 'hy';

export const LOCALE_NAMES: Record<AuthLocale, string> = {
  hy: 'Հայերեն',
  ru: 'Русский',
  en: 'English',
};

export function isAuthLocale(v: unknown): v is AuthLocale {
  return typeof v === 'string' && v in AUTH_DICTS;
}

export function authDict(locale: string | null | undefined): AuthDict {
  return isAuthLocale(locale) ? AUTH_DICTS[locale] : AUTH_DICTS[DEFAULT_AUTH_LOCALE];
}

/**
 * Какой язык показать.
 *
 * Порядок ответов: явный выбор человека → язык браузера → армянский.
 * Явный выбор всегда сильнее браузера: человек с русским макбуком в
 * Ереване может хотеть армянский интерфейс, и переспрашивать его каждый
 * раз незачем.
 *
 * Заголовок разбирается грубо и намеренно: полный RFC 4647 с весами тут
 * ничего не добавит — вариантов три.
 */
export function pickAuthLocale(input: {
  cookie?: string | null;
  acceptLanguage?: string | null;
}): AuthLocale {
  if (isAuthLocale(input.cookie)) return input.cookie;

  const header = (input.acceptLanguage ?? '').toLowerCase();
  for (const chunk of header.split(',')) {
    const tag = chunk.split(';')[0]!.trim();
    const base = tag.split('-')[0];
    if (isAuthLocale(base)) return base;
  }

  return DEFAULT_AUTH_LOCALE;
}

/** Имя cookie с выбранным языком. Не HttpOnly: это предпочтение, не секрет. */
export const LOCALE_COOKIE = 'bz_locale';
