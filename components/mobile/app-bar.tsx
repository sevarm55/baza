'use client';

import { usePathname } from 'next/navigation';

import { BranchLabel, BranchSwitcher } from '@/components/shell/branch-switcher';
import { Bell } from '@/components/shell/bell';
import { BarUserMenu } from '@/components/shell/user-menu';
import { MobileBackHeader, MobileTopBar } from '@/components/mobile/header';
import { pageTitle } from '@/components/sections';
import { useT } from '@/lib/i18n/client';
import type { Point } from '@/lib/accounts';
import type { Alert } from '@/lib/alerts';

/**
 * Шапка приложения на телефоне — одна на два разных состояния.
 *
 * На корневом экране вкладки слева стоит адрес того, на что смотришь:
 * филиал. У кого он один — тихое название, у кого несколько —
 * переключатель. Ровно так устроена панель экрана смены в приложении.
 * Марки здесь нет намеренно: в приложении на этом месте её тоже нет,
 * знак стоит на иконке, а в панели живёт ответ на вопрос «где я».
 *
 * На вложенном экране — «← Название», как во всех разделах приложения.
 * Не хлебные крошки: на трёхстах шестидесяти точках цепочка из трёх
 * слов не помещается, а рука ищет стрелку в левом верхнем углу, и
 * находит она её там всегда.
 *
 * Справа поводы и учётка — те же компоненты, что у десктопа: человек с
 * двумя ролями на двух мойках должен видеть одно и то же меню.
 */
export function MobileAppBar({
  tenantName,
  points,
  currentTid,
  canManage = false,
  alerts,
  userName,
  roleLabel,
  owner,
  shiftOpen,
}: {
  tenantName: string;
  points: Point[];
  currentTid: string;
  canManage?: boolean;
  /** поводы для колокольчика; пусто — колокольчика нет вовсе */
  alerts?: Alert[];
  userName: string;
  roleLabel: string;
  owner: boolean;
  shiftOpen?: boolean;
}) {
  const t = useT();
  const pathname = usePathname();
  const many = points.length > 1;

  const parent = parentOf(pathname);
  if (parent) {
    return (
      <MobileBackHeader
        href={parent}
        title={pageTitle(pathname, t) ?? tenantName}
        backLabel={t.common.back}
      />
    );
  }

  return (
    <MobileTopBar
      left={
        many ? (
          <BranchSwitcher
            points={points}
            currentId={currentTid}
            canManage={canManage}
            className="min-w-0"
          />
        ) : (
          <BranchLabel name={tenantName} className="text-[15px] font-semibold text-m-ink" />
        )
      }
      right={
        <>
          {alerts && <Bell alerts={alerts} />}
          <BarUserMenu
            userName={userName}
            roleLabel={roleLabel}
            owner={owner}
            shiftOpen={shiftOpen}
          />
        </>
      }
    />
  );
}

/**
 * Куда ведёт стрелка «назад».
 *
 * Адрес считается по самому адресу, а не берётся из истории браузера:
 * `history.back()` уводит с сайта у того, кто открыл раздел по ссылке
 * из переписки, — и это единственный случай, когда «назад» ведёт не
 * назад.
 *
 * Пусто значит «это корень вкладки»: там стрелки нет вовсе, а слева
 * стоит филиал.
 */
function parentOf(pathname: string): string | null {
  /* Корни вкладок: экран смены, сводка, зарплаты, «Ещё». */
  if (pathname === '/work' || pathname === '/owner' || pathname === '/owner/more') return null;
  if (pathname === '/owner/payroll') return null;

  /* Машина открывается из списка клиентов, день — из календаря: назад
     ведёт туда, откуда сюда приходят, а не на уровень выше по адресу. */
  if (pathname.startsWith('/owner/clients/')) return '/owner/clients';
  if (pathname.startsWith('/owner/day/')) return '/owner/calendar';
  /* Лента событий — это подробности сводки, и возвращает она туда же. */
  if (pathname.startsWith('/owner/activity')) return '/owner';

  /* Всё остальное открывают из «Ещё» — карты бизнеса. */
  if (pathname.startsWith('/owner/')) return '/owner/more';
  return null;
}
