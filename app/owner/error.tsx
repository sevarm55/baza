'use client';

import { useEffect } from 'react';
import { AsyncError } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Сводка не доехала.
 *
 * Отказ одного прибора страница переживает сама: график ловит свою
 * ошибку и превращает её в состояние панели, всё остальное продолжает
 * отвечать. Сюда попадает случай похуже — не доехали деньги, и показать
 * нечего.
 *
 * Тогда страница остаётся страницей: заголовок, одна строка о том, что
 * случилось, и кнопка повторить. Белый экран вместо сумм читается как
 * «данные пропали», а не как «связь моргнула», и на экране, куда
 * заходят по сорок раз за смену, эта разница дорогая.
 *
 * Ни кода ошибки, ни подробностей: владельцу мойки они ничего не
 * говорят, а испугать успевают. Разбираться с причиной — работа журнала
 * сервера.
 */
export default function TodayError({
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
    <>
      <h1 className="page-title">{t.owner.tabToday}</h1>

      {/* Тот же вид отказа, что у прибора внутри страницы: одно
          сообщение и одна кнопка, которая сама показывает, что повтор
          пошёл. Два разных вида ошибки в одном продукте заставляют
          читать каждый заново. */}
      <div
        className="panel-pad mt-[var(--seam)] rounded-[var(--radius-card)]"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      >
        <AsyncError title={t.today.loadFailed} note={t.common.offlineNote} onRetry={reset} />
      </div>
    </>
  );
}
