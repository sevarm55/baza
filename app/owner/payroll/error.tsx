'use client';

import { useEffect } from 'react';
import { hy } from '@/lib/i18n/hy';

/**
 * Зарплаты не доехали.
 *
 * Отдельная граница у этой страницы, а не общая на кабинет: здесь считают
 * деньги, и белый экран вместо сумм читается как «данные пропали», а не
 * как «связь моргнула». Поэтому страница остаётся страницей — заголовок,
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
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <>
      <h1 className="page-title">{hy.owner.tabPayroll}</h1>

      <div
        className="panel-pad mt-[var(--seam)] grid justify-items-center gap-2 rounded-[var(--radius-card)] py-12 text-center"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
      >
        <p className="text-[15px] font-semibold">{hy.payroll.loadFailed}</p>
        <button type="button" className="btn-inline mt-2" onClick={reset}>
          {hy.payroll.retry}
        </button>
      </div>
    </>
  );
}
