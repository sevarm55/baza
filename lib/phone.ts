/**
 * Телефон — это логин. Сотрудник введёт его как угодно:
 * 077123456, 77 12 34 56, +374 77 123456. Всё это один и тот же человек,
 * поэтому в базу кладём строго E.164.
 *
 * Форматирование в браузере — только украшение. Решение о том, что за
 * номер пришёл, принимается ЗДЕСЬ, на сервере: строку из формы можно
 * подделать, а этот модуль зовут и веб, и приложение, и скрипты.
 */

/** Страна по умолчанию. Продукт начинался в Армении и там же живёт. */
export const DEFAULT_COUNTRY = 'AM';

export type Country = {
  /** ISO 3166-1 alpha-2 — по нему страна и опознаётся в коде */
  code: string;
  /** телефонный код без плюса */
  dial: string;
  /** флаг — только картинка; ни одно решение на него не опирается */
  flag: string;
  /** сколько цифр в национальном номере, без кода страны */
  nsn: number[];
  /** как показывать: длины групп после кода страны */
  groups: number[];
  /** пример для placeholder */
  example: string;
};

/**
 * Список стран.
 *
 * Открытый массив, а не зашитая Армения: расширяется одной строкой, и
 * ничего, кроме этого файла, при добавлении страны не меняется. Порядок
 * значим — первым идёт тот, кто нужен девяноста девяти клиентам из ста.
 */
export const COUNTRIES: Country[] = [
  { code: 'AM', dial: '374', flag: '🇦🇲', nsn: [8], groups: [2, 3, 3], example: '77 123 456' },
  { code: 'RU', dial: '7', flag: '🇷🇺', nsn: [10], groups: [3, 3, 2, 2], example: '912 345 67 89' },
  { code: 'GE', dial: '995', flag: '🇬🇪', nsn: [9], groups: [3, 3, 3], example: '555 123 456' },
  { code: 'AE', dial: '971', flag: '🇦🇪', nsn: [9], groups: [2, 3, 4], example: '50 123 4567' },
  { code: 'US', dial: '1', flag: '🇺🇸', nsn: [10], groups: [3, 3, 4], example: '415 555 0123' },
];

export function country(code: string): Country {
  return COUNTRIES.find((c) => c.code === code) ?? COUNTRIES[0];
}

/** Самый длинный подходящий код страны: +1 не должен побеждать +374. */
function byDial(digits: string): Country | undefined {
  return [...COUNTRIES]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => digits.startsWith(c.dial));
}

/**
 * Привести к E.164.
 *
 * `countryCode` — подсказка из формы: какой код страны человек видел
 * рядом с полем. Именно подсказка, а не приказ: набранный целиком номер с
 * плюсом сильнее любой подсказки, иначе вставленный из переписки
 * российский номер молча стал бы армянским.
 */
/**
 * Разбить набранное по группам страны: 77123456 → 77 123 456.
 *
 * Живёт здесь, а не в поле ввода, потому что полей два: продуктовое
 * (`components/phone-field.tsx`) и витринное
 * (`components/landing/auth-ui.tsx`). Вид у них разный, разбивка обязана
 * быть одна.
 */
export function groupNsn(digits: string, countryCode: string): string {
  const c = country(countryCode);
  const parts: string[] = [];
  let at = 0;
  for (const size of c.groups) {
    if (at >= digits.length) break;
    parts.push(digits.slice(at, at + size));
    at += size;
  }
  if (at < digits.length) parts.push(digits.slice(at));
  return parts.join(' ');
}

/**
 * Оставить от набранного только национальную часть.
 *
 * Вставленный номер приходит с кодом страны, с плюсом, с восьмёркой.
 * Лишнее отрезается здесь, иначе код уедет в национальную часть и номер
 * не сойдётся ни с одной проверкой.
 */
export function nationalDigits(next: string, countryCode: string): string {
  const c = country(countryCode);
  const max = Math.max(...c.nsn);
  let digits = next.replace(/\D/g, '');

  if (digits.length > max) {
    if (digits.startsWith(c.dial)) digits = digits.slice(c.dial.length);
    else if (digits.startsWith('0')) digits = digits.slice(1);
  }

  return digits.slice(0, max);
}

export function normalizePhone(raw: string, countryCode: string = DEFAULT_COUNTRY): string {
  const trimmed = String(raw ?? '').trim();
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return '';

  const hinted = country(countryCode);

  // явный международный формат — верим ему, а не подсказке
  if (trimmed.startsWith('+') || trimmed.startsWith('00')) {
    const clean = trimmed.startsWith('00') ? digits.slice(2) : digits;
    return `+${clean}`;
  }

  // местная запись с ведущим нулём: 0XX XXXXXX
  if (digits.startsWith('0')) return `+${hinted.dial}${digits.slice(1)}`;

  // ровно национальный номер выбранной страны
  if (hinted.nsn.includes(digits.length)) return `+${hinted.dial}${digits}`;

  // номер вместе с кодом какой-то из известных стран, но без плюса
  const guessed = byDial(digits);
  if (guessed && guessed.nsn.includes(digits.length - guessed.dial.length)) return `+${digits}`;

  // не разобрали — отдаём как есть, отказ выпишет isValidPhone
  return `+${digits}`;
}

/**
 * Похоже ли на настоящий номер.
 *
 * Две проверки, и вторая важнее. Общая рамка E.164 (9–15 цифр) пропускает
 * почти всё; поэтому для известных стран длина сверяется точно. Без этого
 * `+3747` считался бы армянским номером, и на него уходила бы SMS.
 */
export function isValidPhone(raw: string, countryCode: string = DEFAULT_COUNTRY): boolean {
  const n = normalizePhone(raw, countryCode);
  if (!/^\+\d{8,15}$/.test(n)) return false;

  const digits = n.slice(1);
  const known = byDial(digits);
  if (known) return known.nsn.includes(digits.length - known.dial.length);

  // страна не из списка: остаётся общая рамка E.164
  return digits.length >= 9;
}

/** +37477123456 → +374 77 123 456. Неизвестная страна остаётся как есть. */
export function formatPhone(e164: string): string {
  if (!e164.startsWith('+')) return e164;
  const digits = e164.slice(1);
  const c = byDial(digits);
  if (!c) return e164;

  const nsn = digits.slice(c.dial.length);
  if (!c.nsn.includes(nsn.length)) return e164;

  const parts: string[] = [];
  let at = 0;
  for (const size of c.groups) {
    if (at >= nsn.length) break;
    parts.push(nsn.slice(at, at + size));
    at += size;
  }
  if (at < nsn.length) parts.push(nsn.slice(at));

  return `+${c.dial} ${parts.join(' ')}`;
}

/**
 * Номер для показа там, где его видит не только владелец: экран
 * подтверждения, письмо, журнал. Середина скрыта, хвост оставлен —
 * человек должен узнать свой номер, не показывая его соседу.
 *
 * +37477123456 → +374 •• ••• •• 56
 */
export function maskPhone(e164: string): string {
  if (!e164.startsWith('+') || e164.length < 6) return '•••';
  const digits = e164.slice(1);
  const c = byDial(digits);
  const dial = c ? c.dial : digits.slice(0, Math.min(3, digits.length - 2));
  const nsn = digits.slice(dial.length);
  if (nsn.length <= 2) return `+${dial} ${nsn}`;

  /* Хвост открыт, всё до него закрыто, разбивка та же, что у обычного
     показа: человек узнаёт свой номер по форме, а не по цифрам. */
  const chars = [...nsn].map((ch, i) => (i < nsn.length - 2 ? '•' : ch));
  const sizes = c?.groups ?? [3, 3, 3];

  const parts: string[] = [];
  let at = 0;
  for (const size of sizes) {
    if (at >= chars.length) break;
    parts.push(chars.slice(at, at + size).join(''));
    at += size;
  }
  if (at < chars.length) parts.push(chars.slice(at).join(''));

  return `+${dial} ${parts.join(' ')}`;
}

/* ------------------------------ PIN ------------------------------ */

/** Сколько цифр в коде. Шесть, а не четыре — см. lib/pin.ts. */
export const PIN_LENGTH = 6;

/**
 * Совсем очевидные коды.
 *
 * Список нарочно короткий. Смысл не в том, чтобы перебрать все слабые
 * комбинации — их не перебрать, — а в том, чтобы отсечь те несколько,
 * которые люди выбирают чаще всего, и не превратить создание кода в
 * экзамен. Правило одно и объясняется одной строкой; всё остальное
 * держат счётчик попыток и подтверждение с незнакомого устройства.
 *
 * Проверяется не список, а три свойства: все цифры одинаковые, подряд
 * вверх, подряд вниз. Плюс горстка «клавиатурных» кодов, которые под эти
 * свойства не подпадают.
 */
const OBVIOUS = new Set(['012345', '696969', '112233', '121212', '123123', '102030']);

export function isTrivialPin(pin: string): boolean {
  if (!/^\d+$/.test(pin)) return false;
  if (OBVIOUS.has(pin)) return true;

  const d = [...pin].map(Number);
  const allSame = d.every((x) => x === d[0]);
  const ascending = d.every((x, i) => i === 0 || x === (d[i - 1] + 1) % 10);
  const descending = d.every((x, i) => i === 0 || x === (d[i - 1] + 9) % 10);

  return allSame || ascending || descending;
}

/** Годится ли строка как НОВЫЙ код. Для сверки существующего не нужна. */
export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin) && !isTrivialPin(pin);
}

/**
 * Почему код не годится — для формы, где «неверный код» бесполезно.
 * Возвращает null, если всё в порядке.
 */
export function pinProblem(pin: string): 'length' | 'trivial' | null {
  if (!new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin)) return 'length';
  if (isTrivialPin(pin)) return 'trivial';
  return null;
}
