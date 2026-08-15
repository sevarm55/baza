import { hy, type Dict } from './hy';
import { ru } from './ru';
import { en } from './en';

export type { Dict };

/**
 * Три языка продукта.
 *
 * Армянский — источник правды: с него продукт написан, и он же запасной
 * вариант, если в другом языке чего-то не хватило. Добавить четвёртый —
 * положить рядом файл той же формы и вписать сюда одну строку;
 * TypeScript заставит заполнить все ключи, а вызовы t() менять не
 * придётся ни в одном файле.
 */
export const DICTS = { hy, ru, en } satisfies Record<string, Dict>;

export type Locale = keyof typeof DICTS;

export const DEFAULT_LOCALE: Locale = 'hy';

export const LOCALES = Object.keys(DICTS) as Locale[];

/**
 * Как язык называется сам на себе.
 *
 * Не переводится и не заменяется флагом. Человек, случайно попавший в
 * чужой язык, ищет глазами СВОЁ слово — «Русский», а не «Ռուսերեն», —
 * и по флагу его не находит: флаг это страна, а не язык.
 */
export const LOCALE_NAMES: Record<Locale, string> = {
  hy: 'Հայերեն',
  ru: 'Русский',
  en: 'English',
};

/** Имя куки с выбором языка. Одно на весь проект — сервер и браузер. */
export const LOCALE_COOKIE = 'tetrin.lang';

/** Сколько живёт выбор: год, чтобы человека не спрашивали заново. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as string[]).includes(value);
}

export function dict(locale: string | null | undefined): Dict {
  return isLocale(locale) ? DICTS[locale] : DICTS[DEFAULT_LOCALE];
}

/**
 * Какой язык показать, когда выбора ещё нет.
 *
 * Порядок: явный выбор человека → язык бизнеса из БД → язык браузера или
 * системы → армянский. Из заголовка берём только то, что продукт умеет:
 * «uk-UA» и «fr» уводят в армянский, а не в пустой экран, потому что
 * четвёртого языка у нас нет.
 *
 * Разбор заголовка нарочно грубый: `q`-веса Accept-Language никто не
 * настраивает руками, а порядок в нём и так стоит по убыванию.
 */
export function resolveLocale(input: {
  chosen?: string | null;
  tenant?: string | null;
  header?: string | null;
}): Locale {
  if (isLocale(input.chosen)) return input.chosen;
  if (isLocale(input.tenant)) return input.tenant;

  for (const part of (input.header ?? '').split(',')) {
    const tag = part.split(';')[0].trim().toLowerCase().split('-')[0];
    if (isLocale(tag)) return tag;
  }

  return DEFAULT_LOCALE;
}
