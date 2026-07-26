/**
 * Телефон — это логин. Сотрудник введёт его как угодно:
 * 077123456, 77 12 34 56, +374 77 123456. Всё это один и тот же человек,
 * поэтому в базу кладём строго E.164.
 */

const DEFAULT_COUNTRY = '374'; // Армения

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith(DEFAULT_COUNTRY)) return `+${digits}`;
  // местная запись 0XX XXXXXX
  if (digits.startsWith('0')) return `+${DEFAULT_COUNTRY}${digits.slice(1)}`;
  // без нуля и без кода страны: 8 цифр
  if (digits.length === 8) return `+${DEFAULT_COUNTRY}${digits}`;

  return `+${digits}`;
}

export function isValidPhone(raw: string): boolean {
  const n = normalizePhone(raw);
  return /^\+\d{9,15}$/.test(n);
}

/** +37477123456 → +374 77 123 456 */
export function formatPhone(e164: string): string {
  const m = e164.match(/^\+374(\d{2})(\d{3})(\d{3})$/);
  return m ? `+374 ${m[1]} ${m[2]} ${m[3]}` : e164;
}

export function isValidPin(pin: string): boolean {
  return /^\d{4}$/.test(pin);
}
