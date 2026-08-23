'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/patterns/error-state';
import { PageHeader } from '@/components/patterns/page-header';
import { useT } from '@/lib/i18n/client';

/**
 * Зарплаты не доехали.
 *
 * Отдельная граница у этой страницы, а не общая на кабинет: здесь считают
 * деньги, и белый экран вместо сумм читается как «данные пропали», а не
 * как «связь моргнула». Поэтому страница остаётся страницей: заголовок,
 * одна строка о том, что случилось, и кнопка попробовать ещё раз.
 *
 * Ни кода ошибки, ни подробностей: владельцу мойки они ничего не говорят,
 * а испугать успевают. Разбираться с причиной — работа журнала сервера.
 */
export default function PayrollError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useT();
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.owner.tabPayroll} />
      <ErrorState title={t.payroll.loadFailed} description={t.common.offlineNote} onRetry={reset} />
    </div>
  );
}
