import { adminRu, type AdminDict } from './ru';
import { adminEn } from './en';
import { adminHy } from './hy';
import type { Locale } from '../index';

export type { AdminDict };

/**
 * Словарь админки по языку интерфейса. Язык тот же, что у продукта
 * (cookie `tetrin.lang`); отдельного переключателя в админке нет.
 */
export const ADMIN_DICTS: Record<Locale, AdminDict> = { ru: adminRu, en: adminEn, hy: adminHy };

export function adminDict(locale: Locale): AdminDict {
  return ADMIN_DICTS[locale] ?? adminRu;
}
