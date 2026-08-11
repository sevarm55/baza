'use client';

import { useEffect, useRef } from 'react';
import { IconClose } from '@/components/icons';
import { hy } from '@/lib/i18n/hy';

export type Group = 'all' | 'loyal' | 'lost';

type Row = { id: string; key: string; visits: number; total: number; days: number };

/**
 * Кто именно стоит за числом в полосе.
 *
 * Число «мшtакан 12» отвечает «сколько», но следующий вопрос всегда
 * «кто». Раньше на него ответить было нечем: приходилось сортировать
 * список и считать строки глазами — то есть делать работу, которую
 * продукт уже сделал, когда посчитал это число.
 *
 * Панелью справа, тем же приёмом, что карточка машины: список под ней
 * остаётся на месте вместе с набранным поиском и выбранным порядком.
 * Строка ведёт дальше, в саму карточку — «кто это» и «что он у меня
 * брал» идут подряд.
 */
export function GroupDrawer({
  group,
  rows,
  lostAfter,
  money,
  onClose,
  onPick,
}: {
  group: Group | null;
  rows: Row[];
  lostAfter: number;
  money: (n: number) => string;
  onClose: () => void;
  onPick: (key: string) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (group && !dialog.open) dialog.showModal();
    if (!group && dialog.open) dialog.close();
  }, [group]);

  const list =
    group === 'loyal'
      ? rows.filter((c) => c.visits > 1)
      : group === 'lost'
        ? rows.filter((c) => c.days > lostAfter)
        : rows;

  /* Порядок свой у каждой группы, и это не мелочь: в «пропавших» сверху
     нужен тот, кто молчит дольше всех, в «постоянных» — кто ходит чаще,
     в «базе» — кто был недавно. Один порядок на три списка отвечал бы
     на вопрос группы только в одном случае из трёх. */
  const sorted = [...list].sort((a, b) =>
    group === 'loyal' ? b.visits - a.visits : group === 'lost' ? b.days - a.days : a.days - b.days,
  );

  const title =
    group === 'loyal'
      ? hy.owner.clientsLoyal
      : group === 'lost'
        ? hy.owner.clientsLost
        : hy.owner.clientsTotal;

  return (
    <dialog
      ref={ref}
      className="drawer"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onClose={onClose}
    >
      <div className="sheet-head">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] leading-tight font-bold tracking-[-0.02em]">
            {title}
          </h2>
          <p className="num sheet-sub">
            {sorted.length} {hy.owner.clientOne}
          </p>
        </div>
        <button type="button" className="sheet-x" onClick={onClose} aria-label={hy.common.cancel}>
          <IconClose className="size-4" />
        </button>
      </div>

      <div className="sheet-body">
        {sorted.length === 0 ? (
          <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
            {hy.common.empty}
          </p>
        ) : (
          <div className="board-journal">
            {sorted.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.key)}
                className="flex w-full items-center gap-2.5 px-0.5 py-2.5 text-start"
              >
                <span className="min-w-0 flex-1">
                  <span className="num flex items-center gap-2">
                    <span className="truncate text-[14px] font-bold tracking-wide">{c.key}</span>
                    {c.visits > 1 && <span className="tag-good">{hy.owner.clientLoyal}</span>}
                  </span>
                  <span
                    className="num block text-[12px]"
                    style={{
                      color: c.days > lostAfter ? 'var(--warn-on-board)' : 'var(--board-muted)',
                    }}
                  >
                    {c.visits} {hy.owner.visits} · {hy.owner.lastVisitPrefix}{' '}
                    {c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
                  </span>
                </span>
                <span className="num shrink-0 text-[14px] font-semibold">{money(c.total)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
