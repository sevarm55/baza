'use client';

import { useEffect } from 'react';
import { AsyncError } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Смена не доехала.
 *
 * У экрана мойщика границы отказа не было вовсе: любая ошибка на нём
 * показывала служебный экран Next с английским текстом и предложением
 * перезагрузить страницу. Мойщик стоит с клиентом у ворот, и такой
 * экран для него означает «приложение сломалось», а не «связь моргнула».
 *
 * Ни кода ошибки, ни подробностей: они ничего ему не говорят, а
 * испугать успевают. Кнопка одна и делает ровно одно.
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
    <div className="mx-auto grid w-full max-w-[46rem]">
      <div
        className="panel-pad rounded-[var(--radius-card)]"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      >
        <AsyncError title={t.work.loadFailed} note={t.common.offlineNote} onRetry={reset} />
      </div>
    </div>
  );
}
