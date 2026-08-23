'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Plus } from 'lucide-react';

import { Bell } from '@/components/shell/bell';
import { pageTitle } from '@/components/sections';
import { Wordmark } from '@/components/wordmark';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { SidebarTrigger } from '@/components/ui/sidebar';
import type { Alert } from '@/lib/alerts';
import { useT } from '@/lib/i18n/client';

/**
 * Верхняя полоса кабинета: переключатель колонки, крошки, справа
 * колокольчик и быстрая запись машины. Полоса прибита к верху и не
 * растёт: всё остальное живёт на странице.
 */
export function TopBar({
  alerts,
  tenantName,
  quickAdd,
}: {
  alerts: Alert[];
  tenantName: string;
  /** подпись быстрой кнопки «+ машина»; пусто, если кнопка не нужна */
  quickAdd?: string | null;
}) {
  const t = useT();
  const pathname = usePathname();
  const title = pageTitle(pathname, t);

  return (
    <header className="safe-top sticky top-0 z-30 flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3 backdrop-blur supports-backdrop-filter:bg-background/80 md:px-4">
      <SidebarTrigger className="-ml-1" aria-label={t.common.expand} />
      <Separator orientation="vertical" className="mx-1 hidden h-4! md:block" />
      <nav aria-label={t.app.name} className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link href="/owner" className="hidden truncate text-muted-foreground hover:text-foreground md:inline">
          {tenantName}
        </Link>
        <span className="md:hidden">
          <Wordmark />
        </span>
        {title && (
          <>
            <span className="hidden text-muted-foreground/60 md:inline" aria-hidden>
              /
            </span>
            <span className="hidden truncate font-medium md:inline" aria-current="page">
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
