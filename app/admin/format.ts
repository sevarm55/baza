import type { Access } from '@/lib/subscription';
import type { StatusTone } from '@/components/patterns/status-badge';

/**
 * Мелочи админки, общие для её страниц: подписи состояний, их тон,
 * русские числительные и даты без Intl (он расходится между сервером и
 * браузером).
 */

export const STATE_LABEL: Record<Access['state'], string> = {
  active: 'Оплачено',
  trial: 'Триал',
  expired: 'Просрочено',
  blocked: 'Отключён',
  // заведена владельцем и ждёт первой оплаты: пробный срок уже израсходован
  unpaid: 'Ждёт оплаты',
};

export const STATE_TONE: Record<Access['state'], StatusTone> = {
  active: 'success',
  trial: 'brand',
  expired: 'danger',
  blocked: 'neutral',
  unpaid: 'warning',
};

/** Формы для 1 / 2-4 / 5+: «2 владельцев» читается как ошибка. */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = n % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const p = (n: number) => String(n).padStart(2, '0');

/** 05.08.2026 */
export function date(d: Date): string {
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** 05.08.2026 14:32 */
export function when(d: Date): string {
  return `${date(d)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 05.08 14:32: для ленты, где год лишний */
export function whenShort(d: Date): string {
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
