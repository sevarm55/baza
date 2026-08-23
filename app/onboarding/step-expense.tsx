'use client';

import { useState, useTransition } from 'react';

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { LoadingButton } from '@/components/loading';
import { FormMessage } from '@/components/patterns/form';
import { useT } from '@/lib/i18n/client';
import { addExpenseStep } from './actions';

/**
 * Шаг 2: один расход.
 *
 * Без слов «финансовый учёт»: сумма, на что потратили и разовый это
 * расход или ежемесячный. Подсказки категорий — те же, что в разделе
 * расходов; своё название пишется поверх. Ежемесячный оставлен нарочно:
 * первым расходом чаще всего называют аренду, и записать её разовой
 * значило бы соврать в первой же цифре прибыли.
 */
export function StepExpense({
  currencySymbol,
  hints,
  onDone,
}: {
  currencySymbol: string;
  hints: readonly string[];
  onDone: () => void;
}) {
  const t = useT();
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('');
  const [monthly, setMonthly] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const picked = hints.includes(category) ? [category] : [];

  function submit() {
    if (pending) return;
    const sum = Number(amount);
    if (!Number.isFinite(sum) || sum <= 0 || !category.trim()) {
      setError(t.errors.required);
      return;
    }
    setError(null);
    start(async () => {
      const res = await addExpenseStep({ amount: sum, category: category.trim(), monthly });
      if (res?.error) setError(res.error);
      else onDone();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{t.firstRun.s2Title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t.firstRun.s2Note}</p>
      </header>

      <Field>
        <FieldLabel htmlFor="fr-expense-amount">{t.expenses.amount}</FieldLabel>
        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>{currencySymbol}</InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            id="fr-expense-amount"
            type="number"
            inputMode="numeric"
            min={1}
            placeholder="0"
            autoFocus
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="num font-medium"
          />
        </InputGroup>
      </Field>

      <Field>
        <FieldLabel htmlFor="fr-expense-category">{t.expenses.category}</FieldLabel>
        {/* Повторное нажатие снимает выбор — как в разделе расходов. */}
        <ToggleGroup
          aria-label={t.expenses.category}
          variant="outline"
          size="sm"
          value={picked}
          onValueChange={(value) => setCategory((value[0] as string) ?? '')}
          className="flex-wrap gap-1.5"
        >
          {hints.map((h) => (
            <ToggleGroupItem
              key={h}
              value={h}
              className="h-7 rounded-md px-2.5 text-xs data-pressed:border-primary/30 data-pressed:bg-primary-soft data-pressed:text-primary-soft-foreground"
            >
              {h}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Input
          id="fr-expense-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder={t.expenses.category}
          autoComplete="off"
        />
      </Field>

      <Field>
        <FieldLabel>{t.expenses.kind}</FieldLabel>
        {/* Два положения одной ширины: выбор есть, но он один тап. */}
        <ToggleGroup
          aria-label={t.expenses.kind}
          variant="outline"
          size="sm"
          value={[monthly ? 'monthly' : 'one']}
          onValueChange={(value) => {
            if (value[0]) setMonthly(value[0] === 'monthly');
          }}
          className="w-full gap-1.5"
        >
          <ToggleGroupItem
            value="one"
            className="h-8 flex-1 rounded-md text-xs data-pressed:border-primary/30 data-pressed:bg-primary-soft data-pressed:text-primary-soft-foreground"
          >
            {t.expenses.oneOff}
          </ToggleGroupItem>
          <ToggleGroupItem
            value="monthly"
            className="h-8 flex-1 rounded-md text-xs data-pressed:border-primary/30 data-pressed:bg-primary-soft data-pressed:text-primary-soft-foreground"
          >
            {t.expenses.monthly}
          </ToggleGroupItem>
        </ToggleGroup>
        {monthly && (
          <FieldDescription className="text-xs">{t.expenses.monthlyStartNote}</FieldDescription>
        )}
      </Field>

      {error && <FormMessage tone="error">{error}</FormMessage>}

      <LoadingButton
        type="button"
        className="w-full"
        busy={pending}
        label={t.expenses.addExpense}
        busyLabel={t.common.adding}
        onClick={submit}
      />
    </div>
  );
}
