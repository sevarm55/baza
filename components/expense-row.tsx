'use client';

import { useActionState, useState } from 'react';
import { removeExpenseAction, saveExpenseAction, type FormState } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * Расход с правкой на месте.
 *
 * Аренда дорожает — это самое обычное событие, и до сих пор его нельзя
 * было отразить иначе, чем удалив расход и заведя заново.
 *
 * Постоянный расход показывает предупреждение, как только сумму тронули:
 * прошлые дни останутся посчитанными по старой, и владелец должен узнать
 * это до того, как нажмёт «сохранить», а не после.
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
  const [draftCategory, setDraftCategory] = useState(category);
  const [draftAmount, setDraftAmount] = useState(String(amount));

  const dirty = draftCategory !== category || draftAmount !== String(amount);
  const amountChanged = draftAmount !== String(amount);

  /* «Сохранено» выводится из состояния, а не заводится отдельным флагом
     с таймером: подпись и так исчезает, как только тронули поле, — а до
     тех пор пусть висит. Гасить её через две секунды значило бы отнимать
     ответ у того, кто в этот момент отвёл глаза. */
  const saved = state?.ok === true && !dirty;

  return (
    <form action={action} className="row-edit">
      <input type="hidden" name="id" value={id} />

      <input
        className="field field-sm w-full sm:w-auto sm:min-w-[8rem] sm:flex-1"
        name="category"
        aria-label={hy.expenses.category}
        value={draftCategory}
        onChange={(e) => setDraftCategory(e.target.value)}
        required
      />

      <div className="relative w-[7.5rem] shrink-0">
        <input
          className="field field-sm num h-full !pe-7"
          name="amount"
          type="number"
          inputMode="numeric"
          min={step}
          step={step}
          aria-label={hy.expenses.amount}
          value={draftAmount}
          onChange={(e) => setDraftAmount(e.target.value)}
          required
        />
        <span className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-[13px] text-faint">
          {currencySymbol}
        </span>
      </div>

      <span className="shrink-0 text-[12.5px] text-muted">{when}</span>

      <div className="ms-auto flex gap-2">
        {dirty && (
          <button className="btn-inline btn-inline-primary" disabled={pending}>
            {pending ? hy.common.loading : hy.settings.save}
          </button>
        )}
        {saved && (
          <span className="self-center text-[13px] font-semibold text-good">
            {hy.settings.saved}
          </span>
        )}
        <button className="btn-inline btn-inline-danger" formAction={removeExpenseAction}>
          {hy.expenses.remove}
        </button>
      </div>

      {monthly && amountChanged && <p className="note w-full">{hy.expenses.changeNote}</p>}
      {state?.error && <p className="alert w-full">{state.error}</p>}
    </form>
  );
}
