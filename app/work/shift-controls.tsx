'use client';

import { useState, useTransition } from 'react';
import { toggleShiftAction } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';

/**
 * Начало и конец смены.
 *
 * Два действия с общим сервером и совершенно разной ценой ошибки,
 * поэтому и выглядят они по-разному.
 *
 * Встать на смену — единственное, что человек может сделать на пустом
 * экране: записывать нельзя, всё остальное ждёт. Поэтому это большая
 * кнопка во всю ширину, и промах по ней ничего не стоит — вторая смена
 * не откроется, сервер вернёт ту же самую.
 *
 * Уйти со смены — наоборот: после этого записывать нельзя до следующей
 * смены, а жмут её один раз за день. Поэтому она внизу и тихая, а перед
 * тем как закрыть, показывает итог дня: сколько машин, сколько работы и
 * сколько из этого твоего.
 */

function toggle(open: boolean) {
  const data = new FormData();
  data.set('open', String(open));
  return toggleShiftAction(data);
}

export function StartShift() {
  const t = useT();
  const [pending, startTransition] = useTransition();

  return (
    <div>
      {/* Кнопка гаснет на время запроса. Не ради второй смены — её не
          даст завести уникальный индекс, — а ради человека: связь на
          мойке пропадает, и кнопка, которая молчит секунду, выглядит
          ненажатой. */}
      <button
        type="button"
        className="btn btn-big"
        disabled={pending}
        onClick={() => startTransition(async () => void (await toggle(true)))}
      >
        {pending ? t.common.loading : t.work.startShift}
      </button>
      {/* Вне смены записывать нельзя: машина, записанная мимо смены, не
          попадает в сдачу наличных при закрытии. То же правило в
          приложении и на сервере. Объяснение стоит под кнопкой, которая
          это правило снимает, а не под той, которую оно гасит. */}
      <p className="note mt-2.5">{t.work.needShift}</p>
    </div>
  );
}

export function EndShift({
  count,
  revenue,
  earned,
  currency,
  unitOne,
}: {
  count: number;
  revenue: number;
  earned: number;
  currency: string;
  unitOne: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="flex w-full items-center justify-center gap-2 rounded-[var(--radius-btn)] px-3 py-2.5 text-[13.5px] font-semibold transition-colors disabled:opacity-50"
        style={{
          background: 'color-mix(in srgb, var(--board-ink) 6%, transparent)',
          color: 'var(--board-muted)',
        }}
        disabled={pending}
        onClick={() => setAsking(true)}
      >
        {t.work.endShift}
      </button>

      {/* Окно продукта, а не браузерный вопрос: `confirm` умеет показать
          только строку и не умеет показать день, который закрывают. А
          читают здесь именно его — три числа, после которых решение
          принимается за секунду. */}
      <Sheet
        open={asking}
        onClose={pending ? () => {} : () => setAsking(false)}
        title={t.work.endTitle}
        footer={
          <>
            <button
              type="button"
              className="btn-inline"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {t.work.endStay}
            </button>
            <button
              type="button"
              className="btn btn-auto"
              disabled={pending}
              onClick={() => startTransition(async () => void (await toggle(false)))}
            >
              {pending ? t.common.loading : t.work.endConfirm}
            </button>
          </>
        }
      >
        <div className="grid gap-3">
          <div className="board-journal">
            <Line label={unitOne} value={String(count)} />
            <Line label={t.work.worksTotal} value={formatMoney(revenue, currency, t.locale)} />
            {/* Свои деньги — последними и полужирным: из трёх строк это
                та, ради которой человек читает окно. */}
            <Line label={t.work.earnedToday} value={formatMoney(earned, currency, t.locale)} strong />
          </div>
          <p className="text-[12.5px]" style={{ color: 'var(--muted)' }}>
            {t.work.endNote(unitOne)}
          </p>
        </div>
      </Sheet>
    </>
  );
}

function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="min-w-0 truncate text-[13.5px]" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span
        className={`num shrink-0 ${strong ? 'text-[17px] font-bold tracking-[-0.02em]' : 'text-[14.5px] font-semibold'}`}
      >
        {value}
      </span>
    </div>
  );
}
