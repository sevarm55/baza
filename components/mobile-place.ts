import { currentSection } from '@/components/sections';
import type { Dict } from '@/lib/i18n';

/**
 * Где человек находится на телефоне и куда его вернёт стрелка назад.
 *
 * Одно правило на два компонента: шапка называет место, панель внизу
 * подсвечивает раздел. Два списка адресов в двух файлах разъезжаются на
 * первом же новом разделе — и тогда шапка говорит одно, а подсвеченная
 * вкладка другое.
 *
 * Корневых экранов ровно четыре, и это те же четыре, что во вкладках
 * приложения. У корневого экрана стрелки назад нет вовсе: возвращаться
 * из него некуда, а стрелка, ведущая «куда-нибудь», хуже её отсутствия.
 */

/** Четыре экрана нижней панели. Из них назад не ходят. */
export const PHONE_ROOTS = ['/work', '/owner', '/owner/payroll', '/owner/more'] as const;

export type PhoneTab = (typeof PHONE_ROOTS)[number];

/**
 * Какая вкладка горит.
 *
 * «Всё остальное» ложится на «Ավելին» осознанно: клиенты, услуги, люди,
 * отчёты и настройки живут именно там, и подсветить на них сводку
 * значило бы сказать человеку, что он в другом месте, чем на самом деле.
 */
export function phoneTab(pathname: string): PhoneTab | null {
  if (pathname === '/work' || pathname.startsWith('/work/')) return '/work';
  if (pathname === '/owner') return '/owner';
  if (pathname === '/owner/payroll' || pathname.startsWith('/owner/payroll/')) {
    return '/owner/payroll';
  }
  return pathname.startsWith('/owner') ? '/owner/more' : null;
}

/**
 * Имя места и адрес возврата.
 *
 * Названия берутся из общего списка разделов — того же, которым живёт
 * боковая колонка на компьютере. Страницы вне списка (моя страница,
 * филиалы, карточка машины) названы здесь: у них нет своего пункта меню,
 * а шапка обязана называть их так же уверенно, как остальные.
 */
export function phonePlace(
  pathname: string,
  t: Dict,
): { title: string; sub?: string; parent: string | null } {
  if ((PHONE_ROOTS as readonly string[]).includes(pathname)) {
    return { title: '', parent: null };
  }

  /* Карточка машины.
   *
   * Шапка называет саму машину, а не раздел: «Հաճախորդներ» над историей
   * одного номера не отвечает на вопрос, чью историю смотрят, — а
   * заголовок страницы под шапкой на телефоне скрыт именно потому, что
   * шапка его повторяет. Номер берётся из адреса: он там и есть ключ
   * записи, второго источника для него не существует.
   *
   * Назад — в список, а не на карту разделов: человек пришёл оттуда и
   * продолжит перебирать его дальше. */
  if (pathname.startsWith('/owner/clients/')) {
    const key = pathname.slice('/owner/clients/'.length).split('/')[0];
    let plate = t.owner.tabClients;
    try {
      plate = decodeURIComponent(key) || plate;
    } catch {
      /* адрес набран руками и разбору не поддался — остаётся имя раздела */
    }
    return { title: plate, parent: '/owner/clients' };
  }
  if (pathname === '/owner/profile') return { title: t.profile.title, parent: '/owner/more' };
  if (pathname === '/owner/points') return { title: t.points.title, parent: '/owner/more' };

  const section = currentSection(pathname, t);
  if (section) return { title: section.label, parent: '/owner/more' };

  return { title: t.app.name, parent: '/owner' };
}
