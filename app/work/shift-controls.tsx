'use client';

import { useState, useTransition } from 'react';
import { toggleShiftAction } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { LoadingButton } from '@/components/loading';

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

function toggle(open: boolean, cash?: string) {
  const data = new FormData();
  data.set('open', String(open));
  /* Пустое поле — это «не отметил», а не ноль, и на сервер оно не едет
     вовсе: владелец должен различать «сдал 0» и «не сказал сколько». */
  if (cash !== undefined && cash !== '') data.set('cash', cash);
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
      <LoadingButton
        type="button"
        className="btn btn-big"
        busy={pending}
        label={t.work.startShift}
        busyLabel={t.work.startingShift}
        onClick={() => startTransition(async () => void (await toggle(true)))}
      />
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
  cash,
  currency,
  unitOne,
}: {
  count: number;
  revenue: number;
  earned: number;
  /**
   * Сколько наличных набралось за смену. Считает сервер тем же
   * `cashInShift`, которым он посчитает ожидаемое при закрытии.
   */
  cash: number;
  currency: string;
  unitOne: string;
}) {
  const t = useT();
  const [asking, setAsking] = useState(false);
  /**
   * Сколько человек говорит, что сдаёт.
   *
   * Подставляем набежавшее: в девяти случаях из десяти сдают именно
   * столько, и заставлять переписывать своё же число незачем. Стереть
   * можно — тогда владелец увидит «не отмечено», и это честнее нуля.
   */
  const [declared, setDeclared] = useState(String(cash));
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
        /* Два равноправных выхода — значит две кнопки одного размера.
           Пара «мелкая слева, крупная справа» в продукте означает
           «отмена и сохранить», то есть объявляет один из выходов
           ошибкой. Здесь ошибочного нет: остаться на смене — такое же
           решение, как её закрыть. Разницу несёт заливка, а не габарит. */
        footer={
          <div className="setup-foot">
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setAsking(false)}
              disabled={pending}
            >
              {t.work.endStay}
            </button>
            <LoadingButton
              type="button"
              className="btn"
              busy={pending}
              label={t.work.endConfirm}
              busyLabel={t.work.endingShift}
              onClick={() => startTransition(async () => void (await toggle(false, declared)))}
            />
          </div>
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

          {/* Сдача наличных.

              Это единственный момент, когда деньги переходят из рук в
              руки, и другого места спросить не будет. До сих пор веб
              закрывал смену молча: сколько намыто наличными, знал сервер,
              а сколько человек отдал — не знал никто, и недостача не
              всплывала вовсе. На телефоне это спрашивали с самого начала.

              Поле не обязательное: закрыться человек должен уметь всегда,
              а пустое означает «не отметил» — владелец увидит именно это,
              а не ноль. */}
          <label className="grid gap-1.5">
            <span className="label">{t.work.handOver}</span>
            <div className="flex items-center gap-2.5">
              <input
                className="field num flex-1 text-end"
                value={declared}
                onChange={(e) => setDeclared(e.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="off"
                disabled={pending}
              />
              <span className="shrink-0 text-[13px]" style={{ color: 'var(--muted)' }}>
                {t.work.cashInShift(formatMoney(cash, currency, t.locale))}
              </span>
            </div>
          </label>

          {/* Расхождение называем сразу, до нажатия: узнать о недостаче
              вечером из уведомления владельца — не то же самое, что
              увидеть её, пока ещё можно пересчитать деньги в руках. */}
          {declared !== '' && Number(declared) !== cash && (
            <p className="note note-warn">
              {t.work.handOverDiff(
                formatMoney(Math.abs(Number(declared) - cash), currency, t.locale),
              )}
            </p>
          )}

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
