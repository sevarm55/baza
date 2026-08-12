'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { addExpenseAction } from '@/app/actions';
import type { FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Новый расход.
 *
 * Было строкой в одну линию: поле категории с выпадающим списком, поле
 * суммы, флажок «Ամսական» и кнопка. Выпадающий список прятал шесть
 * готовых названий за нажатием, а флажок требовал знать заранее, что он
 * делает: «постоянный» и «разовый» — это два разных расхода, а не
 * галочка у одного.
 *
 * Теперь форма идёт сверху вниз, как счёт на кассе: сколько → за что →
 * какой это расход. Готовые названия лежат фишками — шесть слов, нажать
 * готовое быстрее, чем набрать армянское слово, а своё при этом никто
 * не запрещает. Вид выбирается двумя карточками, и у каждой своё
 * объяснение прямо в ней.
 *
 * Та же форма, что в приложении. Два экрана одного продукта не должны
 * заводить расход по-разному.
 */
export function AddExpenseForm({
  currencySymbol,
  hints,
}: {
  currencySymbol: string;
  hints: readonly string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExpenseAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState('');
  const [monthly, setMonthly] = useState(false);

  /* Расходы заводят пачкой — за неделю сразу, — поэтому после каждого
     форма очищается и курсор возвращается к сумме. Вид расхода при этом
     сбрасывается тоже: следующая запись чаще всего другого рода, а
     невидимый выбор, оставшийся от прошлой, — это тихая ошибка.

     Поля, которыми управляет React, чистятся прямо при отрисовке
     нового ответа, а не в эффекте: состояние, поставленное из эффекта,
     заставляет React рисовать кадр дважды — сначала со старым
     значением, потом с пустым. Эффекту остаётся то, что состоянием не
     выражается: сброс неуправляемых полей и фокус. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) {
      setCategory('');
      setMonthly(false);
    }
  }

  useEffect(() => {
    if (!state?.ok) return;
    formRef.current?.reset();
    amountRef.current?.focus();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-3.5">
      {/* Сумма первой и крупно: с ней приходят. Название вспоминают уже
          после того, как посмотрели в чек. */}
      <label className="grid gap-1.5">
        <span className="label">{hy.expenses.amount}</span>
        <div className="relative">
          <input
            ref={amountRef}
            className="field auth-field num !ps-9 !text-[19px] !font-semibold"
            name="amount"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="0"
            required
          />
          <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[16px] text-faint">
            {currencySymbol}
          </span>
        </div>
      </label>

      <div className="grid gap-2">
        <span className="label">{hy.expenses.category}</span>

        <div className="flex flex-wrap gap-1.5">
          {hints.map((h) => (
            /* Повторное нажатие снимает выбор: иначе, ткнув мимо,
               человек не может вернуться к своему названию, не стирая
               поле руками. */
            <button
              key={h}
              type="button"
              className="chip"
              data-on={category === h ? '' : undefined}
              onClick={() => setCategory((c) => (c === h ? '' : h))}
            >
              {h}
            </button>
          ))}
        </div>

        <input
          className="field auth-field"
          name="category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={hy.expenses.category}
          required
          autoComplete="off"
        />
      </div>

      <div className="grid gap-2">
        <div className="kind">
          <Kind
            title={hy.expenses.oneOff}
            note={hy.expenses.kindOneNote}
            on={!monthly}
            onPick={() => setMonthly(false)}
            icon={
              <>
                <path d="M3 5.5h2l1.4 6.2h6.6l1.2-4.4H6" />
                <circle cx="7.2" cy="13.6" r="1" />
                <circle cx="12.4" cy="13.6" r="1" />
              </>
            }
          />
          <Kind
            title={hy.expenses.monthly}
            note={hy.expenses.kindMonthlyNote}
            on={monthly}
            onPick={() => setMonthly(true)}
            icon={
              <>
                <path d="M13.5 8a5.5 5.5 0 1 1-1.7-3.9" />
                <path d="M13.6 2.8v2.6H11" />
              </>
            }
          />
        </div>
        {/* Флажка нет, но действие ждёт того же имени: карточки — это он
            и есть, только читаемый. */}
        {monthly && <input type="hidden" name="monthly" value="on" />}
      </div>

      <button className="btn mt-0.5" disabled={pending}>
        {pending ? hy.common.loading : hy.expenses.add}
      </button>

      {state?.error && <p className="alert">{state.error}</p>}
    </form>
  );
}

function Kind({
  title,
  note,
  on,
  onPick,
  icon,
}: {
  title: string;
  note: string;
  on: boolean;
  onPick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button type="button" className="kind-card" data-on={on ? '' : undefined} onClick={onPick} aria-pressed={on}>
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
      <span className="kind-title">{title}</span>
      <span className="kind-note">{note}</span>
    </button>
  );
}
