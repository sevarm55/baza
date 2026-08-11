'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { clientHistory } from '@/app/actions';
import { IconClose } from '@/components/icons';
import { hy } from '@/lib/i18n/hy';
import { personColor } from '@/lib/person-color';

type History = Awaited<ReturnType<typeof clientHistory>>;

/**
 * История машины выдвижной панелью справа.
 *
 * Список клиентов длинный, и уход на отдельную страницу теряет место, на
 * котором человек стоял, вместе с набранным поиском и выбранным
 * порядком. Панель оставляет список на экране: закрыл — продолжил с той
 * же строки.
 *
 * Данные приходят серверным действием по нажатию, а не грузятся вперёд
 * для всех строк: у мойки сотни машин, и history каждой — это сотни
 * запросов ради одного, который откроют.
 *
 * Страница `/owner/clients/[key]` при этом осталась. На неё ссылаются
 * извне и открывают из адреса; панель — путь внутри списка, страница —
 * путь снаружи, и обе считают одно и то же одной функцией.
 */
export function ClientDrawer({
  plate,
  onClose,
  money,
}: {
  /** какая машина открыта; `null` — панель закрыта */
  plate: string | null;
  onClose: () => void;
  money: (n: number) => string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<History>(null);
  const [pending, start] = useTransition();

  /* Эффект только открывает и закрывает окно — то, что нельзя выразить
     разметкой: `showModal` это императивный вызов браузера. */
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (plate && !dialog.open) dialog.showModal();
    if (!plate && dialog.open) dialog.close();
  }, [plate]);

  /* А загрузка привязана к смене номера, а не к эффекту.

     Через эффект это выглядело короче, но означало лишний проход
     отрисовки: React рисует панель со старым содержимым, потом эффект
     сбрасывает состояние и рисует ещё раз. На экране это кадр, где под
     новым номером стоит чужая история — худшая ошибка из возможных
     там, где считают деньги. Сверка прямо в теле снимает и кадр, и
     жалобу линтера на setState в эффекте. */
  const [shown, setShown] = useState<string | null>(null);
  if (shown !== plate) {
    setShown(plate);
    setData(null);
    if (plate) start(async () => setData(await clientHistory(plate)));
  }

  const c = data?.client;
  const avg = c && c.visits > 0 ? Math.round(c.total / c.visits) : 0;

  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // клик по затемнению: цель события — сам <dialog>, а не панель
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onClose={onClose}
    >
      <div className="sheet-head">
        <div className="min-w-0">
          <h2 className="num truncate text-[17px] leading-tight font-bold tracking-[-0.02em]">
            {plate}
          </h2>
          {c && (
            <p className="num sheet-sub">
              {c.visits} {hy.owner.visits} · {hy.owner.clientAvg} {money(avg)} ·{' '}
              {hy.owner.lastVisitPrefix}{' '}
              {c.daysSince === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.daysSince)}
            </p>
          )}
        </div>
        <button type="button" className="sheet-x" onClick={onClose} aria-label={hy.common.cancel}>
          <IconClose className="size-4" />
        </button>
      </div>

      <div className="sheet-body">
        {/* Итог отдельной строкой и крупно: с ним сюда и заходят —
            «сколько эта машина мне принесла». */}
        {c && (
          <div
            className="mb-4 flex items-baseline justify-between gap-3 rounded-[var(--radius-card)] p-4"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
          >
            <span className="text-[13px]" style={{ color: 'var(--board-muted)' }}>
              {hy.owner.clientsTotalSpent}
            </span>
            <span className="num text-[26px] leading-none font-bold tracking-[-0.03em]">
              {money(c.total)}
            </span>
          </div>
        )}

        {pending && !data && (
          <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
            {hy.common.loading}
          </p>
        )}

        {data && data.orders.length === 0 && (
          <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
            {hy.common.empty}
          </p>
        )}

        {data && data.orders.length > 0 && (
          <div className="board-journal">
            {data.orders.map((o) => (
              <div key={o.id} className="flex items-center gap-2.5 px-0.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold">{o.serviceName}</span>
                  <span
                    className="num flex items-center gap-1.5 truncate text-[12px]"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ background: personColor(o.staffName) }}
                      aria-hidden
                    />
                    {o.staffName ?? '—'} · {paymentLabel(o.payment)} · {o.day} {o.time}
                  </span>
                </span>
                <span className="num shrink-0 text-[14px] font-semibold">{money(o.price)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
