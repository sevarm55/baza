'use client';

import { useEffect } from 'react';

import { ErrorState } from '@/components/patterns/error-state';
import { useT } from '@/lib/i18n/client';

/**
 * Смена не доехала.
 *
 * Мойщик стоит с клиентом у ворот, и служебный экран с английским
 * текстом означает для него «приложение сломалось», а не «связь
 * моргнула». Ни кода ошибки, ни подробностей: они ничего ему не говорят,
 * а испугать успевают. Кнопка одна и делает ровно одно.
 */
export default function WorkError({
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
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-6">
      <ErrorState title={t.work.loadFailed} description={t.common.offlineNote} onRetry={reset} />
    </div>
  );
}
