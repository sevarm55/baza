import 'server-only';
import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  dict,
  isLocale,
  resolveLocale,
  type Dict,
  type Locale,
} from './index';

/**
 * Язык страницы на сервере.
 *
 * Живёт в куке, а не в адресе: у продукта нет публичных страниц, которые
 * кто-то делит ссылкой на своём языке, зато есть закладки на `/owner` и
 * `/work`, и раскладывать их по `/ru/owner` значило бы сломать все
 * сохранённые адреса и все ссылки в пушах ради ничего.
 *
 * Кука читается на каждом запросе, и это делает страницы динамическими —
 * они и так динамические: за ними база и сессия.
 *
 * `tenants.locale` сюда не приезжает намеренно: язык интерфейса — дело
 * человека, а не бизнеса. На одной мойке владелец может смотреть отчёты
 * по-русски, а мойщик записывать машины по-армянски. Язык бизнеса
 * (`tenants.locale`) используется там, где человека спросить негде, —
 * в письмах и пушах, которые собирает сервер.
 */
export async function getLocale(): Promise<Locale> {
  const jar = await cookies();
  const chosen = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(chosen)) return chosen;

  /* Первый заход: выбора ещё нет, и спрашивать человека посреди работы
     нечестно. Берём язык его же браузера, если он нам знаком. */
  const h = await headers();
  return resolveLocale({ header: h.get('accept-language') });
}

/** Словарь текущего языка. Основной способ получить строки на сервере. */
export async function getDict(): Promise<Dict> {
  return dict(await getLocale());
}

/**
 * Язык и словарь разом — там, где нужны оба: даты и деньги форматируются
 * по локали, а подписи берутся из словаря.
 */
export async function getI18n(): Promise<{ locale: Locale; t: Dict }> {
  const locale = await getLocale();
  return { locale, t: dict(locale) };
}

export { DEFAULT_LOCALE };
