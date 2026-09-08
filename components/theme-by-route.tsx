'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Пересчёт темы при переходе внутри продукта.
 *
 * Тему до первого кадра ставит скрипт в `<head>` (см. `theme-script`), и
 * он отрабатывает ровно один раз — при загрузке документа. Дальше человек
 * ходит по продукту клиентскими переходами, документ не перезагружается,
 * и тема остаётся той, что встала на первой странице.
 *
 * Со стороны это выглядело так: витрина открывается тёмной (её первый
 * экран — кадр съёмки), человек входит и попадает в кабинет — а кабинет
 * остаётся тёмным, хотя вид продукта светлый. Зайди тот же человек на
 * `/owner` по прямой ссылке, он увидел бы белый лист. Одна и та же
 * страница выглядела по-разному в зависимости от того, каким путём на
 * неё пришли.
 *
 * Правило здесь повторяет скрипт слово в слово: выбранная руками тема
 * главнее всего, а без выбора тёмная живёт только на корне. Разойтись им
 * нельзя — иначе первый кадр и следующий за ним переход снова покажут
 * разное.
 */
export function ThemeByRoute() {
  const pathname = usePathname();

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem('bazis.theme');
    } catch {
      /* приватный режим: выбора нет, идём по адресу */
    }
    /* Человек переключил тему сам — его выбор не трогаем нигде. */
    if (saved) return;

    const dark = pathname === '/';
    const next = dark ? 'dark' : 'light';
    if (document.documentElement.dataset.theme === next) return;

    document.documentElement.dataset.theme = next;
    /* Строка состояния телефона красится цветом листа под ней, иначе
       сверху остаётся полоса прежней темы. */
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#0b0614' : '#ffffff');
    /* Тем же событием, что и ручное переключение: значок в шапке и ряд в
       настройках читают тему из документа и ждут именно его. */
    window.dispatchEvent(new Event('tetrin:theme-change'));
  }, [pathname]);

  return null;
}
