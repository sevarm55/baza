'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Bell as BellIcon } from 'lucide-react';
import { snoozeAlert } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { IconClock, IconWallet } from '@/components/flow-icons';
import type { Alert } from '@/lib/alerts';
import { Button } from '@/components/ui/button';
import { SidebarMenuBadge, SidebarMenuButton } from '@/components/ui/sidebar';
import { useT } from '@/lib/i18n/client';

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
export function Bell({ alerts, sidebar = false }: { alerts: Alert[]; sidebar?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      {sidebar ? (
        <>
          <SidebarMenuButton className="h-10 px-4" tooltip={t.alerts.title} onClick={() => setOpen(true)}>
            <BellIcon aria-hidden="true" />
            <span>{t.alerts.title}</span>
          </SidebarMenuButton>
          {alerts.length > 0 && <SidebarMenuBadge>{alerts.length}</SidebarMenuBadge>}
        </>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="relative"
          onClick={() => setOpen(true)}
          aria-label={t.alerts.title}
        >
          <BellIcon aria-hidden="true" />
          {alerts.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-4 text-destructive-foreground">
              {alerts.length}
            </span>
          )}
        </Button>
      )}

      <Sheet open={open} onClose={() => setOpen(false)} side title={t.alerts.title}>
        {alerts.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[15px] font-semibold">{t.alerts.empty}</p>
            <p className="mt-1.5 text-[13px]" style={{ color: 'var(--board-muted)' }}>
              {t.alerts.emptyNote}
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
                  <span className="tone-mark" data-tone={a.tone === 'warn' ? 'amber' : 'violet'}>
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
                  {t.alerts.later}
                </button>
              </div>
            ))}
          </div>
        )}
      </Sheet>
    </>
  );
}
