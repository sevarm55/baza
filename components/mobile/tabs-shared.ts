/**
 * Что знают о полосе вкладок обе стороны.
 *
 * Отдельным модулем без `'use client'`: имя cookie и разбор её значения
 * нужны и серверу (он выбирает, какую полосу отдать сразу), и браузеру
 * (он этот выбор меняет). Из клиентского модуля сервер вызвать функцию
 * не может — это и есть причина, по которой файла два.
 */
export type TabsVariant = 'grape' | 'light' | 'bar' | 'ink' | 'pill';

export const TABS_VARIANTS: TabsVariant[] = ['grape', 'light', 'bar', 'ink', 'pill'];

/** Имя cookie с выбранным материалом полосы. Ничего личного в ней нет. */
export const TABS_COOKIE = 'tetr_tabs';

export function isTabsVariant(value: string | null | undefined): value is TabsVariant {
  return value != null && (TABS_VARIANTS as string[]).includes(value);
}

/** Вариант из cookie: этим сервер выбирает, какую полосу отдать сразу. */
export function tabsFromCookie(value: string | undefined): TabsVariant {
  return isTabsVariant(value) ? value : 'grape';
}
