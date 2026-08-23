'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Bell } from '@/components/shell/bell';
import { BranchLabel, BranchSwitcher } from '@/components/shell/branch-switcher';
import { pageTitle } from '@/components/sections';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { Point } from '@/lib/accounts';
import type { Alert } from '@/lib/alerts';
import { useT } from '@/lib/i18n/client';

/**
 * Верхняя полоса кабинета: «где я» слева, «что можно сделать» справа.
 *
 * Слева контекст данных и страница: `Аршакуняц ▾ / Сегодня`. Филиал
 * стоит именно здесь, потому что это адрес того, на что смотришь, а не
 * раздел, куда можно перейти. У кого филиал один, вместо переключателя
 * стоит тихое название. Справа быстрая запись машины и колокольчик.
 * Аккаунт живёт внизу колонки и здесь не повторяется.
 *
 * Полоса прибита к верху и не растёт: всё остальное живёт на странице.
 */
export function TopBar({
  alerts,
  tenantName,
  points,
  currentTid,
  canManage,
  quickAdd,
}: {
  alerts: Alert[];
  tenantName: string;
  points: Point[];
  currentTid: string;
  /** ссылка на страницу филиалов в переключателе: только владельцу */
  canManage: boolean;
  /** подпись быстрой кнопки «+ машина»; пусто, если кнопка не нужна */
  quickAdd?: string | null;
}) {
  const t = useT();
  const pathname = usePathname();
  const title = pageTitle(pathname, t);
  const many = points.length > 1;

  return (
    <header className="safe-top sticky top-0 z-30 flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-4">
      <SidebarTrigger className="-ml-1" aria-label={t.common.expand} />
      <Separator orientation="vertical" className="mx-1 hidden h-4! md:block" />

      <nav aria-label={t.app.name} className="flex min-w-0 items-center gap-1 text-sm">
        {many ? (
          <BranchSwitcher points={points} currentId={currentTid} canManage={canManage} />
        ) : (
          <BranchLabel name={tenantName} />
        )}
        {title && (
          <>
            <span className="hidden text-muted-foreground/60 md:inline" aria-hidden>
              /
            </span>
            <span className="hidden truncate text-muted-foreground md:inline" aria-current="page">
              {title}
            </span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-1">
        {quickAdd && (
          <Button size="sm" variant="outline" render={<Link href="/work" />} className="hidden sm:inline-flex">
            <Plus data-icon="inline-start" />
            {quickAdd}
          </Button>
        )}
        <Bell alerts={alerts} />
      </div>
    </header>
  );
}
