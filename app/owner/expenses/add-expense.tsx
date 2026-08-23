'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { addExpenseAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Новый расход: кнопка и лист с формой.
 *
 * Порядок полей как в чеке: сколько, за что, какой это расход. Готовые
 * названия лежат фишками: нажать готовое быстрее, чем набрать армянское
 * слово, а своё никто не запрещает.
 *
 * Вид расхода выбирается двумя карточками, и от него зависит остальное.
 * Разовый спрашивает день: расходы заводят пачкой, за всю неделю сразу.
 * Постоянный дня не спрашивает: он действует с сегодняшнего и дальше
 * набегает сам, и об этом сказано прямо в форме.
 */
export function AddExpense({
  currencySymbol,
  hints,
  today,
  variant = 'default',
  openNew = false,
}: {
  currencySymbol: string;
  hints: readonly string[];
  /** «2026-08-15» в поясе бизнеса: задним числом можно, вперёд нельзя */
  today: string;
  /** в шапке главная кнопка, в пустом месте тихая */
  variant?: 'default' | 'outline';
  /**
   * Открыть форму сразу: сюда приводит быстрое действие со сводки.
   * Только начальное состояние, а не управление: закрыл и закрыто,
   * адрес с этим не спорит.
   */
  openNew?: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(addExpenseAction, null);
  const [open, setOpen] = useState(openNew);
  const [category, setCategory] = useState('');
  const [monthly, setMonthly] = useState(false);

  /* Управляемые поля чистятся при отрисовке нового ответа, а не в
     эффекте: эффект рисовал бы кадр с уже сохранённым, но ещё открытым
     листом. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) {
      setCategory('');
      setMonthly(false);
      setOpen(false);
    }
  }

  const picked = hints.includes(category) ? [category] : [];

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus data-icon="inline-start" aria-hidden />
        {t.expenses.addExpense}
      </Button>

      <EntitySheet
        open={open}
        onOpenChange={setOpen}
        title={t.expenses.addExpense}
        footer={
          <SheetActions>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="expense-new"
              busy={pending}
              label={t.expenses.add}
              busyLabel={t.common.adding}
            />
          </SheetActions>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова, поля пустые, а не с прошлым недописанным расходом. */}
        <form
          key={String(open)}
          id="expense-new"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="flex flex-col gap-5"
        >
          <FieldGroup>
            {/* Сумма первой: с ней приходят. Название вспоминают уже
                после того, как посмотрели в чек. */}
            <Field>
              <FieldLabel htmlFor="expense-amount">{t.expenses.amount}</FieldLabel>
              <InputGroup>
                <InputGroupAddon>
                  <InputGroupText>{currencySymbol}</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput
                  id="expense-amount"
                  name="amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  placeholder="0"
                  required
                  autoFocus
                  className="num font-medium"
                />
              </InputGroup>
            </Field>

            <Field>
              <FieldLabel htmlFor="expense-category">{t.expenses.category}</FieldLabel>
              {/* Повторное нажатие снимает выбор: иначе, ткнув мимо,
                  человек не может вернуться к своему названию, не стирая
                  поле руками. */}
              <ToggleGroup
                aria-label={t.expenses.common}
                variant="outline"
                size="sm"
                value={picked}
                onValueChange={(value) => setCategory(value[0] ?? '')}
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
                id="expense-category"
                name="category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                placeholder={t.expenses.category}
                required
                autoComplete="off"
              />
            </Field>

            <FieldSet>
              <FieldLegend variant="label">{t.expenses.kind}</FieldLegend>
              <RadioGroup
                value={monthly ? 'monthly' : 'one'}
                onValueChange={(value) => setMonthly(value === 'monthly')}
              >
                <FieldLabel htmlFor="expense-kind-one">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{t.expenses.oneOff}</FieldTitle>
                      <FieldDescription className="text-xs">{t.expenses.kindOneNote}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="one" id="expense-kind-one" />
                  </Field>
                </FieldLabel>
                <FieldLabel htmlFor="expense-kind-monthly">
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{t.expenses.monthly}</FieldTitle>
                      <FieldDescription className="text-xs">
                        {t.expenses.kindMonthlyNote}
                      </FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value="monthly" id="expense-kind-monthly" />
                  </Field>
                </FieldLabel>
              </RadioGroup>
              {/* Флажка нет, но действие ждёт того же имени: карточки и
                  есть он, только читаемый. */}
              {monthly && <input type="hidden" name="monthly" value="on" />}
            </FieldSet>

            {monthly ? (
              <FieldDescription>{t.expenses.monthlyStartNote}</FieldDescription>
            ) : (
              <Field>
                <FieldLabel htmlFor="expense-at">{t.expenses.date}</FieldLabel>
                <Input
                  id="expense-at"
                  name="at"
                  type="date"
                  defaultValue={today}
                  max={today}
                  className="num"
                />
              </Field>
            )}
          </FieldGroup>

          <FormMessage tone="error">{state?.error}</FormMessage>
        </form>
      </EntitySheet>
    </>
  );
}
