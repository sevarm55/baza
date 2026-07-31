import { startOfDay } from './queries';

/**
 * Границы суток и месяца в часовом поясе бизнеса.
 *
 * Живёт отдельным модулем, потому что этим пользуются и календарь, и
 * страница дня. Резать время они обязаны одинаково: иначе итог месяца не
 * сойдётся с суммой дней, и объяснить это будет нечем.
 *
 * Опирается на `startOfDay`, который считает смещение зоны через
 * Intl — то есть по настоящим правилам, а не «плюс четыре часа». Разница
 * видна дважды в год, когда сутки длятся 23 или 25 часов.
 */

/**
 * Сегодняшняя дата в зоне бизнеса, строкой.
 *
 * Не `startOfDay(...).toISOString().slice(0, 10)`: полночь в Ереване — это
 * восемь вечера предыдущего дня по UTC, и такая строка давала бы вчера.
 * Каждый день, а не в редком случае.
 */
export function localDate(timezone: string, at = new Date()): string {
  // en-CA даёт ровно YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/** Похоже ли на YYYY-MM-DD. */
export function isDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

/** Похоже ли на YYYY-MM. */
export function isMonth(v: string): boolean {
  return /^\d{4}-\d{2}$/.test(v);
}

/**
 * Полдень, а не полночь.
 *
 * Точку внутри суток берём заведомо далёкую от их края: полночь в зоне
 * бизнеса может оказаться предыдущим днём по UTC, и день поехал бы на
 * единицу. С полудня такого не бывает ни в одной зоне.
 */
function noonUtc(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** Сутки `YYYY-MM-DD` в зоне бизнеса. */
export function dayBounds(date: string, timezone: string) {
  const [y, m, d] = date.split('-').map(Number);
  const from = startOfDay(timezone, noonUtc(y, m, d));
  // следующий день считаем от его собственного полудня, а не «плюс 24
  // часа»: при переводе стрелок сутки длиннее или короче суток
  const next = new Date(Date.UTC(y, m - 1, d + 1, 12));
  return { from, to: startOfDay(timezone, next) };
}

/** Месяц `YYYY-MM` в зоне бизнеса и число дней в нём. */
export function monthBounds(month: string, timezone: string) {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: startOfDay(timezone, noonUtc(y, m, 1)),
    to: startOfDay(timezone, new Date(Date.UTC(y, m, 1, 12))),
    days,
  };
}
