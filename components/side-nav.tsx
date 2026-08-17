'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePendingTab } from '@/components/use-pending-tab';
import { currentSection, sectionsFor } from '@/components/sections';
import { useT } from '@/lib/i18n/client';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';

/** Primary app navigation composed entirely from shadcn Sidebar parts. */
export function SideNav({
  passes,
  hint,
}: {
  passes: boolean;
  /**
   * Раздел, в котором лежит следующий шаг настройки, — и только он.
   *
   * Одна точка на всю колонку и только у нового бизнеса. Подсветить
   * восемь разделов сразу значит не подсветить ни одного, а после
   * настройки не подсвечивается вовсе ничего: указывать «сюда» человеку,
   * который знает продукт, — это шум, от которого нельзя избавиться.
   */
  hint?: string | null;
}) {
  const t = useT();
  const pathname = usePathname();
  const sections = sectionsFor(passes, t);
  const { setOpenMobile } = useSidebar();

  /* «Вы находитесь здесь» считает `currentSection` — там же, где
     заголовок страницы. Две копии этого правила расходились: меню
     подсвечивало один раздел, а заголовок называл другой. */
  const current = currentSection(pathname, t)?.href ?? '';

  const { active, pending, select } = usePendingTab(current);

  /* Четыре группы вместо трёх, и распределение задано списком адресов,
     а не «всё остальное».

     Раньше последняя группа собиралась вычитанием: что не обзор и не
     деньги — то управление. Из-за этого настройки стояли в одном
     столбце с людьми и клиентами, хотя они не рабочая сущность, а
     обслуживание продукта; и любой новый раздел молча падал туда же.

     Теперь принадлежность объявлена, а не выведена: раздел, забытый в
     этом списке, окажется в «управлении» осознанно — там же, где живут
     остальные сущности бизнеса. */
  const FINANCE = ['/owner/payroll', '/owner/expenses', '/owner/reports'];
  const SYSTEM = ['/owner/settings'];

  const overview = sections.filter((section) => section.href === '/owner');
  const finance = FINANCE.map((href) => sections.find((s) => s.href === href)).filter(
    (s) => s !== undefined,
  );
  const system = SYSTEM.map((href) => sections.find((s) => s.href === href)).filter(
    (s) => s !== undefined,
  );
  const management = sections.filter(
    (section) =>
      section.href !== '/owner' &&
      !FINANCE.includes(section.href) &&
      !SYSTEM.includes(section.href),
  );

  function renderSection(section: (typeof sections)[number]) {
    const selected = active === section.href;
    return (
      <SidebarMenuItem key={section.href}>
        <SidebarMenuButton
          render={
            <Link
              href={section.href}
              onClick={() => {
                select(section.href);
                setOpenMobile(false);
              }}
              aria-current={selected ? 'page' : undefined}
              data-pending={pending && selected ? '' : undefined}
            />
          }
          isActive={selected}
          tooltip={section.label}
          /* Размеры взяты с боковой колонки витрины, до точки: строка в
             36, поле 10, скругление мелкой детали, подпись 13 средним.
             Значок приглушён и загорается только у выбранного — так по
             колонке видно, где вы, ещё до чтения слова. */
          className="h-9 gap-2.5 rounded-[var(--radius-chip)] px-2.5 text-[13px] font-medium [&>svg]:size-[15px] [&>svg]:opacity-75 data-active:bg-good-bg data-active:font-semibold data-active:text-good-ink data-active:hover:bg-good-bg data-active:hover:text-good-ink data-active:[&>svg]:opacity-100"
        >
          {section.icon}
          <span>{section.label}</span>
          {hint === section.href && (
            <span className="hint-dot hint-dot-nav" title={t.setup.hintAria}>
              <span className="sr-only">{t.setup.hintAria}</span>
            </span>
          )}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  /* Один список, без заголовков групп и без разделителей.

     Группы были: «финансы», «управление», «система». На девяти разделах
     они добавляли к колонке три подписи капсом и три черты — семь лишних
     строк, из которых ни одна никуда не ведёт. Колонка при этом отвечает
     на один вопрос: куда пойти. Порядок разделов остался прежним, он и
     несёт группировку — деньги идут подряд, сущности бизнеса следом,
     обслуживание последним.

     Ровно так собрана колонка на витрине, и человек, который её видел,
     обязан узнать эту. */
  return (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-0.5">
          {[...overview, ...finance, ...management, ...system].map(renderSection)}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
