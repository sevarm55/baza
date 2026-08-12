'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { snoozeAlert } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { hy } from '@/lib/i18n/hy';
import { IconClock, IconWallet } from '@/components/flow-icons';
import type { Alert } from '@/lib/alerts';

/**
 * Колокольчик владельца.
 *
 * Показывает не ленту событий, а список поводов — состояний мойки,
 * каждое из которых требует одного конкретного действия. Пятеро
 * пропавших клиентов, забытая открытая смена, неделя без выплаты: у
 * всех трёх есть кнопка, и все три перестают гореть, когда дело
 * сделано.
 *
 * Цифра на колокольчике — число поводов, а не «непрочитанных». Нет
 * поводов — нет и цифры: колокольчик с вечной единицей перестают
 * замечать за неделю.
 *
 * Открывается панелью справа, как всё остальное в кабинете: список под
 * ней остаётся на месте, и видно, откуда пришёл.
 */
export function Bell({ alerts }: { alerts: Alert[] }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="rail-bell"
        onClick={() => setOpen(true)}
        aria-label={hy.alerts.title}
        data-on={alerts.length > 0 ? '' : undefined}
      >
        <svg
          viewBox="0 0 16 16"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M4 7a4 4 0 0 1 8 0c0 2.2.5 3.3 1.2 4H2.8C3.5 10.3 4 9.2 4 7Z" />
          <path d="M6.6 13a1.6 1.6 0 0 0 2.8 0" />
        </svg>

        {/* Число, а не точка: «есть повод» и «поводов пять» — разные
            новости, и вторая заставляет открыть сразу. */}
        {alerts.length > 0 && <span className="num rail-bell-count">{alerts.length}</span>}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side title={hy.alerts.title}>
        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[15px] font-semibold">{hy.alerts.empty}</p>
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--board-muted)' }}>
              {hy.alerts.emptyNote}
            </p>
          </div>
        ) : (
          /* Строками, а не карточками.
       
             Карточка с цветной полосой слева и двумя кнопками — чужой
             приём: так выглядят уведомления в любом шаблоне, и в
             кабинете, где всё остальное — строки с волосяной линией,
             она читается вставкой из другого продукта. Здесь то же, что
             в списке машин: значок, две строки текста, шеврон. Нажатие
             по всей строке ведёт туда, где повод закрывают.
       
             «Հետո» стоит отдельной тихой подписью, а не второй кнопкой:
             отложить — это не равноправный выбор, а отказ, и кричать о
             нём незачем. */
          <div className="board-journal">
            {alerts.map((a) => (
              <div key={a.key} className="alert-row">
                <Link href={a.href} className="alert-hit" onClick={() => setOpen(false)}>
                  <span className="flow-mark" data-tone={a.tone === 'warn' ? 'amber' : 'violet'}>
                    {a.key === 'payroll-due' ? IconWallet : IconClock}
                  </span>

                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-semibold">{a.title}</span>
                    <span className="block text-[12.5px]" style={{ color: 'var(--muted)' }}>
                      {a.note}
                    </span>
                  </span>

                  <span className="alert-go" aria-hidden />
                </Link>

                <button
                  type="button"
                  className="alert-later"
                  disabled={pending}
                  onClick={() => startTransition(() => snoozeAlert(a.key))}
                >
                  {hy.alerts.later}
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
