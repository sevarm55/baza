import { hy, type Dict } from './hy';

export type { Dict };

/**
 * Поддерживаемые локали. Русский добавляется одной строкой:
 *   import { ru } from './ru'  →  const DICTS = { hy, ru }
 * TypeScript заставит заполнить все ключи, а вызовы t() менять не придётся.
 */
export const DICTS = { hy } satisfies Record<string, Dict>;

export type Locale = keyof typeof DICTS;

export const DEFAULT_LOCALE: Locale = 'hy';

export const LOCALES = Object.keys(DICTS) as Locale[];

export function dict(locale: string | null | undefined): Dict {
  return DICTS[(locale ?? DEFAULT_LOCALE) as Locale] ?? DICTS[DEFAULT_LOCALE];
}
