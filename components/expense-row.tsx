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
  display,
  monthly,
  when,
  currencySymbol,
  step,
  readOnly = false,
}: {
  id: string;
  category: string;
  amount: number;
  /* Та же сумма, но уже разбитая на разряды. Раздельно, потому что в
     строке её читают, а в поле правки — набирают: «300 000» в поле
     ввода числа браузер не примет. */
  display: string;
  monthly: boolean;
  when: string;
  currencySymbol: string;
  step: number;
  /** Закрытый месяц — история: его строки нельзя менять задним числом. */
  readOnly?: boolean;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpenseAction, null);
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(
    removeExpenseAction,
    null,
  );
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draftAmount, setDraftAmount] = useState(String(amount));

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  const amountChanged = draftAmount !== String(amount);

  const summary = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{category}</span>
        <span className="num block text-[13.5px] text-muted">{when}</span>
      </span>
      <span className="num text-[15px] tabular-nums">
        {display} <span className="text-faint">{currencySymbol}</span>
      </span>
    </>
  );

  return (
    <>
      {readOnly ? (
        <div className="row-open cursor-default">{summary}</div>
      ) : (
        <button type="button" className="row-open" onClick={() => setOpen(true)}>
          {summary}
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => {
          setConfirming(false);
          setOpen(false);
        }}
        title={confirming ? hy.expenses.removeTitle : category}
        subtitle={when}
        side
        footer={
          confirming ? (
            <>
              <button
                type="button"
                className="btn-inline me-auto"
                onClick={() => setConfirming(false)}
                disabled={removing}
              >
                {hy.common.cancel}
              </button>
              <button
                form={`rm-${id}`}
                className="btn-inline btn-inline-danger"
                disabled={removing}
              >
                {removing ? hy.common.loading : hy.expenses.remove}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                className="btn-inline btn-inline-danger me-auto"
                onClick={() => setConfirming(true)}
              >
                {hy.expenses.remove}
              </button>
              <button form={`ed-${id}`} className="btn btn-auto" disabled={pending}>
                {pending ? hy.common.loading : hy.settings.save}
              </button>
            </>
          )
        }
      >
        {confirming ? (
          <div className="grid gap-3">
            <p className="note">
              {monthly ? hy.expenses.removeMonthlyNote : hy.expenses.removeOneOffNote}
            </p>
            {removeState?.error && <p className="alert">{removeState.error}</p>}
          </div>
        ) : (
          <form id={`ed-${id}`} action={action} className="grid gap-3">
            <input type="hidden" name="id" value={id} />

            <label className="grid gap-1.5">
              <span className="label">{hy.expenses.category}</span>
              <input className="field" name="category" defaultValue={category} required autoFocus />
            </label>

            <label className="grid gap-1.5">
              <span className="label">{hy.expenses.amount}</span>
              <div className="relative">
                <input
                  className="field num !ps-8"
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min={step}
                  step={step}
                  value={draftAmount}
                  onChange={(e) => setDraftAmount(e.target.value)}
                  required
                />
                <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                  {currencySymbol}
                </span>
              </div>
            </label>

            {monthly && amountChanged && <p className="note">{hy.expenses.changeNote}</p>}
            {state?.error && <p className="alert">{state.error}</p>}
          </form>
        )}

        <form id={`rm-${id}`} action={removeAction} className="hidden">
          <input type="hidden" name="id" value={id} />
        </form>
      </Sheet>
    </>
  );
}
