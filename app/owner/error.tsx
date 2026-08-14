'use client';

import { useEffect } from 'react';
import { hy } from '@/lib/i18n/hy';

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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1 className="page-title">{hy.owner.tabToday}</h1>

      <div
        className="panel-pad mt-[var(--seam)] grid justify-items-center gap-2 rounded-[var(--radius-card)] py-12 text-center"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      >
        <p className="text-[15px] font-semibold">{hy.today.loadFailed}</p>
        <button type="button" className="btn-inline mt-2" onClick={reset}>
          {hy.payroll.retry}
        </button>
      </div>
    </>
  );
}
