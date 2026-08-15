/**
 * Деньги хранятся целым числом в минимальных единицах валюты.
 * Для AMD минимальная единица — драм (дробных частей на практике нет),
 * для EUR/USD это будут центы. Никаких float в деньгах — никогда.
 */

const DECIMALS: Record<string, number> = { AMD: 0, RUB: 2, USD: 2, EUR: 2, GEL: 2 };
const SYMBOLS: Record<string, string> = { AMD: '֏', RUB: '₽', USD: '$', EUR: '€', GEL: '₾' };

/* toLocaleString('hy-AM') даёт разный результат в Node и в браузере:
   на сервере выходило «5 000», в браузере «5,000». На одном экране
   уживались оба варианта, а React ругался на несовпадение разметки.
   Поэтому форматируем сами — результат одинаковый везде и всегда.

   Разделители заданы escape-последовательностями намеренно: в исходнике
   обычный пробел и неразрывный выглядят одинаково, и такую опечатку
   глазами не поймать. */
const GROUP = ' '; // неразрывный: сумма не разорвётся переносом строки
const BEFORE_SYMBOL = ' ';
const DECIMAL = ',';

export function formatMoney(amount: number, currency = 'AMD'): string {
  const decimals = DECIMALS[currency] ?? 2;
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const scale = 10 ** decimals;

  let out = group(Math.floor(abs / scale));
  if (decimals > 0) out += DECIMAL + String(abs % scale).padStart(decimals, '0');
  if (negative) out = '−' + out;

  return `${out}${BEFORE_SYMBOL}${SYMBOLS[currency] ?? currency}`;
}

/**
 * То же число, но без знака валюты.
 *
 * Нужно там, где знак уже нарисован рядом отдельным цветом — в строках
 * списков. Разряды при этом обязаны разбиваться так же: «300000» рядом с
 * «305 000 ֏» в той же таблице читается опечаткой, а не другой суммой.
 */
export function formatAmount(amount: number, currency = 'AMD'): string {
  const decimals = DECIMALS[currency] ?? 2;
  const negative = amount < 0;
  const abs = Math.abs(Math.round(amount));
  const scale = 10 ** decimals;

  let out = group(Math.floor(abs / scale));
  if (decimals > 0) out += DECIMAL + String(abs % scale).padStart(decimals, '0');
  return negative ? '−' + out : out;
}

function group(n: number): string {
  const s = String(n);
  let out = '';
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += GROUP;
    out += s[i];
  }
  return out;
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
