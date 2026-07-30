'use client';

import { useActionState, useEffect, useRef } from 'react';
import { addExpenseAction } from '@/app/actions';
import type { FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function AddExpenseForm({
  currencySymbol,
  hints,
}: {
  currencySymbol: string;
  hints: readonly string[];
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addExpenseAction, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="row-edit">
      {/* Подсказки списком, а не выпадашкой: категорию чаще пишут свою,
          а готовый вариант должен экономить нажатия, а не ограничивать. */}
      <input
        className="field field-sm w-full sm:w-auto sm:min-w-[9rem] sm:flex-1"
        name="category"
        list="expense-hints"
        aria-label={hy.expenses.category}
        placeholder={hy.expenses.category}
        required
        autoComplete="off"
      />
      <datalist id="expense-hints">
        {hints.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>

      <div className="relative w-[7.5rem] shrink-0">
        <input
          className="field field-sm num h-full !pe-7"
          name="amount"
          type="number"
          inputMode="numeric"
          min={1}
          aria-label={hy.expenses.amount}
          placeholder={hy.expenses.amount}
          required
        />
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">
          {currencySymbol}
        </span>
      </div>

      <label className="flex shrink-0 items-center gap-2 text-[13px]">
        <input type="checkbox" name="monthly" className="size-4" />
        {hy.expenses.monthly}
      </label>

      <button className="btn-inline btn-inline-primary ms-auto" disabled={pending}>
        {pending ? hy.common.loading : hy.expenses.add}
      </button>

      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
