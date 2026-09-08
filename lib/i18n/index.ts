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
 * Порядок короткий: явный выбор человека → язык бизнеса из БД →
 * армянский. `header` остаётся в сигнатуре, потому что зовущие его
 * передают, но на ответ он больше не влияет.
 */
export function resolveLocale(input: {
  chosen?: string | null;
  tenant?: string | null;
  header?: string | null;
}): Locale {
  if (isLocale(input.chosen)) return input.chosen;
  if (isLocale(input.tenant)) return input.tenant;

  /* Язык браузера больше не смотрим, как и язык телефона в приложении.
     Продукт работает в Армении, и его язык армянский; браузер при этом
     у половины людей русский или английский с прошлой жизни, и они
     получали интерфейс, который владелец не заказывал. Кому нужен
     другой язык, переключает его в один тап, и выбор запоминается в
     `chosen`. */
  void input.header;

  return DEFAULT_LOCALE;
}
