'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { ErrorState } from '@/components/patterns/error-state';
import { PageHeader } from '@/components/patterns/page-header';
import { pageTitle } from '@/components/sections';
import { useT } from '@/lib/i18n/client';

/**
 * Раздел не загрузился. Заголовок берётся по адресу, а не вшит: граница
 * ошибок одна на весь кабинет, и «Сегодня» над упавшим отчётом врало бы.
 * Кода ошибки нет: владельцу он ничего не скажет.
 */
export default function OwnerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  const pathname = usePathname();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={pageTitle(pathname, t) ?? t.owner.tabToday} />
      <ErrorState title={t.today.loadFailed} description={t.common.offlineNote} onRetry={reset} />
    </div>
  );
}
