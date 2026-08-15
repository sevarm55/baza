import { DEFAULT_LOCALE, isLocale, type Locale } from './index';

/**
 * Даты и числа на языке того, кто смотрит.
 *
 * Руками даты не собираются нигде: «12.08.2026» — это не дата, а способ
 * поссорить американца с армянином. Всё идёт через `Intl`, и всё — с
 * явным часовым поясом бизнеса: сутки мойки считаются по её часам, а не
 * по часам того, кто на неё смотрит (подробности в lib/time.ts).
 */

/**
 * Полный языковой тег для `Intl`.
 *
 * Английский — американский намеренно: он даёт «August 16», а British
 * даёт «16 August». Порядок «месяц число» и есть та форма, которую
 * англоязычный читатель ждёт от подписи под цифрой.
 */
const TAGS: Record<Locale, string> = {
  hy: 'hy-AM',
  ru: 'ru-RU',
  en: 'en-US',
};

/**
 * Язык приходит строкой (`t.locale`, кука, заголовок приложения) — чужой
 * тег молча уводит в армянский, а не роняет форматтер.
 */
export function intlLocale(locale: string = DEFAULT_LOCALE): string {
  return TAGS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

type Fmt = Intl.DateTimeFormat;

/** «16 августа» / «August 16» / «16 օգոստոսի» — день, каким его называют. */
export function longDay(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  });
}

/** То же самое, но с годом: для дат из прошлых лет. */
export function longDayYear(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  });
}

/** «16 авг.» — короткая форма для строк списка. */
export function shortDay(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'short',
    timeZone: timezone,
  });
}

/** «август» / «August» / «օգոստոս» — имя месяца целиком. */
export function monthName(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'long',
    timeZone: timezone,
  });
}

/** «авг.» — имя месяца для оси графика, где место считают пикселями. */
export function shortMonth(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    month: 'short',
    timeZone: timezone,
  });
}

/** Одно число дня — для диапазона «1 — 7 августа». */
export function dayNumber(locale: string, timezone: string): Fmt {
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    timeZone: timezone,
  });
}

/**
 * Первая буква заглавная.
 *
 * `Intl` отдаёт имя месяца так, как язык пишет его в середине фразы:
 * по-русски «август», по-английски «August». Там, где месяц стоит
 * заголовком, русскому нужна прописная — и только ему: армянское
 * «օգոստոս» в заголовке остаётся строчным по правилам своего письма,
 * а английское уже пришло с большой буквы.
 */
export function titleCase(value: string, locale: string): string {
  if (locale !== 'ru' || !value) return value;
  return value[0].toLocaleUpperCase('ru') + value.slice(1);
}
