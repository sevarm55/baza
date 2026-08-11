'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingTab } from '@/components/use-pending-tab';
import { sectionsFor } from '@/components/sections';

/**
 * Меню разделов в боковой колонке.
 *
 * Активный раздел определяется по началу адреса, а не по точному
 * совпадению: `/owner/points` живёт внутри настроек, и подсветка
 * должна оставаться на них, иначе на этой странице не выбрано ничего.
 *
 * Флаг абонементов приходит с сервера — клиентский код до переменных
 * окружения не достаёт.
 */
export function SideNav({ passes }: { passes: boolean }) {
  const pathname = usePathname();
  const sections = sectionsFor(passes);

  /* Самое длинное совпадение, иначе «Сегодня» (`/owner`) подсвечивался
     бы на каждой странице кабинета разом с открытым разделом.

     Ничего не совпало — не подсвечено ничего: на экране записи владелец
     стоит вне разделов, и горящий «Сегодня» обещал бы ему, что он там. */
  const current =
    [...sections]
      .sort((a, b) => b.href.length - a.href.length)
      .find((s) => pathname === s.href || pathname.startsWith(`${s.href}/`))?.href ?? '';

  const { active, pending, select } = usePendingTab(current);

  return (
    <nav className="flex flex-col gap-0.5">
      {sections.map((s) => (
        <Link
          key={s.href}
          href={s.href}
          onClick={() => select(s.href)}
          aria-current={active === s.href ? 'page' : undefined}
          data-pending={pending && active === s.href ? '' : undefined}
          className={`nav-item ${active === s.href ? 'nav-item-on' : ''}`}
          /* Имя раздела в атрибуте: в свёрнутой колонке подписи нет, и
             подсказку под курсором рисует CSS из этого значения — без
             состояния, обработчиков и лишнего клиентского кода. */
          data-name={s.label}
        >
          <span className="nav-mark">{s.icon}</span>
          <span className="rail-hide truncate">{s.label}</span>
        </Link>
      ))}
    </nav>
  );
}
