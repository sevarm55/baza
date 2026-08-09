'use client';

import { useActionState, useState } from 'react';
import { removeExpenseAction, saveExpenseAction, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { hy } from '@/lib/i18n/hy';

/**
 * Расход в списке.
 *
 * Строка читается: за что, сколько, когда. Правка — окном.
 *
 * Постоянный расход предупреждает, как только сумму тронули: прошлые
 * дни останутся посчитанными по старой, и владелец должен узнать это
 * до того, как нажмёт «сохранить», а не после.
 */
export function ExpenseRow({
  id,
  category,
  amount,
  monthly,
  when,
  currencySymbol,
  step,
}: {
  id: string;
  category: string;
  amount: number;
  monthly: boolean;
  when: string;
  currencySymbol: string;
  step: number;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpenseAction, null);
  const [open, setOpen] = useState(false);
  const [draftAmount, setDraftAmount] = useState(String(amount));

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  const amountChanged = draftAmount !== String(amount);

  return (
    <>
      <button type="button" className="row-open" onClick={() => setOpen(true)}>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-medium">{category}</span>
          <span className="num block text-[13.5px] text-muted">{when}</span>
        </span>
        <span className="num text-[15px] tabular-nums">
          {amount} <span className="text-faint">{currencySymbol}</span>
        </span>
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={category}>
        <form action={action} className="grid gap-3">
          <input type="hidden" name="id" value={id} />

          <label className="grid gap-1.5">
            <span className="label">{hy.expenses.category}</span>
            <input className="field" name="category" defaultValue={category} required autoFocus />
          </label>

          <label className="grid gap-1.5">
            <span className="label">{hy.expenses.amount}</span>
            <div className="relative">
              <input
                className="field num !pe-9 text-end"
                name="amount"
                type="number"
                inputMode="numeric"
                min={step}
                step={step}
                value={draftAmount}
                onChange={(e) => setDraftAmount(e.target.value)}
                required
              />
              <span className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                {currencySymbol}
              </span>
            </div>
          </label>

          {monthly && amountChanged && <p className="note">{hy.expenses.changeNote}</p>}
          {state?.error && <p className="alert">{state.error}</p>}

          <button className="btn mt-1" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        </form>

        <form action={removeExpenseAction} className="mt-3 flex justify-end">
          <input type="hidden" name="id" value={id} />
          <button className="btn-inline btn-inline-danger">{hy.expenses.remove}</button>
        </form>
      </Sheet>
    </>
  );
}
