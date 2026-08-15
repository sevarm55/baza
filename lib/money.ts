/**
 * Деньги хранятся целым числом в минимальных единицах валюты.
 * Для AMD минимальная единица — драм (дробных частей на практике нет),
 * для EUR/USD это будут центы. Никаких float в деньгах — никогда.
 */

/**
 * Потолок любой суммы, которую принимает продукт.
 *
 * Столбцы денег — `integer`, то есть до 2 147 483 647. Всё, что больше,
 * Postgres не принимает, и запрос падал уже на вставке: расход в
 * триллион отвечал 500 «INTERNAL» вместо «столько не бывает». Разница не
 * косметическая — 500 читается как поломка сервера, и человек жмёт
 * «сохранить» ещё раз, вместо того чтобы убрать лишний ноль.
 *
 * Округлое число ниже границы типа: сумма может ещё складываться с
 * другими (итог за день, за месяц), и упираться потолком ровно в предел
 * столбца значило бы ловить ту же ошибку на первом же сложении.
 */
export const MAX_MONEY = 1_000_000_000;

/** Похоже ли на сумму: целое, не отрицательное, в пределах разумного. */
export function isSaneMoney(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_MONEY;
}

const DECIMALS: Record<string, number> = { AMD: 0, RUB: 2, USD: 2, EUR: 2, GEL: 2 };
const SYMBOLS: Record<string, string> = { AMD: '֏', RUB: '₽', USD: '$', EUR: '€', GEL: '₾' };

/* toLocaleString('hy-AM') даёт разный результат в Node и в браузере:
   на сервере выходило «5 000», в браузере «5,000». На одном экране
   уживались оба варианта, а React ругался на несовпадение разметки.
   Поэтому форматируем сами — результат одинаковый везде и всегда.

   Разделители заданы escape-последовательностями намеренно: в исходнике
   обычный пробел и неразрывный выглядят одинаково, и такую опечатку
   глазами не поймать. */
const BEFORE_SYMBOL = ' ';

/**
 * Разряды и дробная часть по языку интерфейса.
 *
 * Считаем сами, а не через `Intl`, по той же причине, что и раньше:
 * результат обязан совпадать на сервере и в браузере до символа, иначе
 * React ругается на разметку, а сумма моргает при гидратации.
 *
 * У армянского и русского разделители одинаковые — неразрывный пробел и
 * запятая, — и это не совпадение: оба языка так и пишут. Английский
 * отличается, и «5,000.50» для него так же обязателен, как «5 000,50»
 * для остальных.
 *
 * ВАЛЮТА ОТ ЯЗЫКА НЕ ЗАВИСИТ. Мойка в Ереване берёт драмы, и владелец,
 * переключивший интерфейс на английский, не начинает получать доллары.
 * Меняется запись числа, а не деньги.
 */
const SEPARATORS: Record<string, { group: string; decimal: string }> = {
  hy: { group: ' ', decimal: ',' },
  ru: { group: ' ', decimal: ',' },
  en: { group: ',', decimal: '.' },
};

function separators(locale: string | undefined) {
  return SEPARATORS[locale ?? 'hy'] ?? SEPARATORS.hy;
}

export function formatMoney(amount: number, currency = 'AMD', locale?: string): string {
  return `${formatAmount(amount, currency, locale)}${BEFORE_SYMBOL}${SYMBOLS[currency] ?? currency}`;
}

/**
 * То же число, но без знака валюты.
 *
 * Нужно там, где знак уже нарисован рядом отдельным цветом — в строках
 * списков. Разряды при этом обязаны разбиваться так же: «300000» рядом с
 * «305 000 ֏» в той же таблице читается опечаткой, а не другой суммой.
 */
export function formatAmount(amount: number, currency = 'AMD', locale?: string): string {
  const sep = separators(locale);
  const decimals = DECIMALS[currency] ?? 2;
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const scale = 10 ** decimals;

  let out = group(Math.floor(abs / scale), sep.group);
  if (decimals > 0) out += sep.decimal + String(abs % scale).padStart(decimals, '0');
  return negative ? '−' + out : out;
}

function group(n: number, separator: string): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += separator;
    out += s[i];
  }
  return out;
}

/**
 * Целое число не-денег: счётчики, количества, проценты.
 *
 * Разряды разбиваются тем же знаком, что и в деньгах: «1 250 машин» и
 * «1 250 ֏» на одной странице обязаны выглядеть родственниками.
 */
export function formatCount(n: number, locale?: string): string {
  const negative = n < 0;
  const out = group(Math.abs(Math.round(n)), separators(locale).group);
  return negative ? '−' + out : out;
}

/* В базе деньги лежат в минимальных единицах, а владелец в форме
   вводит привычные ему цифры. Для AMD это одно и то же, для EUR — нет. */

export function currencySymbol(currency = 'AMD'): string {
  return SYMBOLS[currency] ?? currency;
}

export function toMajor(minor: number, currency = 'AMD'): number {
  return minor / 10 ** (DECIMALS[currency] ?? 2);
}

export function toMinor(major: number, currency = 'AMD'): number {
  return Math.round(major * 10 ** (DECIMALS[currency] ?? 2));
}

/** Доля исполнителя. Округляем вниз — бизнес не должен уходить в минус на копейках. */
export function staffShare(price: number, percent: number): number {
  return Math.floor((price * percent) / 100);
}

/**
 * Доля в процентах — целыми, но без округлённого нуля.
 *
 * «65 000 ֏ · 0 %» в разрезе выручки читается как поломка: деньги вот
 * они, а доли у них нет. Округление до целых честно для восьми
 * процентов и врёт для полупроцента — а полупроцент здесь обычное дело,
 * потому что в разрезе рядом стоит услуга, дающая девяносто девять.
 *
 * Меньше процента так и называется — меньше процента. Знак пишется
 * математический, тот же, что у минуса в деньгах: браузерный `<` в
 * тексте рядом с числом читается началом разметки.
 */
export function formatShare(part: number, whole: number): string {
  if (whole <= 0) return '0';
  const exact = (part / whole) * 100;
  if (exact > 0 && exact < 1) return '<1';
  return String(Math.round(exact));
}
