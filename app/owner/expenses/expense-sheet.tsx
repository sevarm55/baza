'use client';

import { startTransition, useActionState, useState } from 'react';
import { removeExpenseAction, saveExpenseAction, type FormState } from '@/app/actions';
import { Button } from '@/components/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import { LoadingButton } from '@/components/loading';
import { ConfirmDialog } from '@/components/patterns/confirm-dialog';
import { DetailList, DetailRow } from '@/components/patterns/detail-list';
import { EntitySheet, SheetActions } from '@/components/patterns/entity-sheet';
import { FormMessage } from '@/components/patterns/form';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import type { ExpenseItem } from './model';

/**
 * Карточка расхода: что это было и что с этим можно сделать.
 *
 * Лист один на весь список, а не свой у каждой строки: форма тут одна
 * и та же, а тридцать скрытых форм в разметке это тридцать состояний,
 * которые надо держать согласованными без единой причины.
 *
 * Сверху факты, ниже правка. Отдельного шага «сначала посмотреть, потом
 * нажать изменить» нет намеренно: сюда приходят с одним из двух дел,
 * исправить опечатку или убрать лишнее, и лишнее нажатие перед каждым
 * из них ничего не объясняет.
 *
 * Постоянный расход предупреждает, как только сумму тронули: прошлые
 * дни останутся посчитанными по старой, и владелец должен узнать это до
 * того, как нажмёт «сохранить», а не после.
 */
export function ExpenseSheet({
  item,
  currency,
  currencySymbol,
  step,
  today,
  readOnly,
  onClose,
}: {
  /** какой расход открыт; `null` значит лист закрыт */
  item: ExpenseItem | null;
  currency: string;
  currencySymbol: string;
  /** шаг ввода: у драма нет копеек, у рубля есть */
  step: number;
  /** «2026-08-15» в поясе бизнеса: дальше этого дня расход не заводят */
  today: string;
  /** закрытый месяц и закрытые постоянные это история, её не правят */
  readOnly: boolean;
  onClose: () => void;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(saveExpenseAction, null);
  const [removeState, removeAction, removing] = useActionState<FormState, FormData>(
    removeExpenseAction,
    null,
  );
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState('');

  /* Состояние сверяется прямо в отрисовке, а не эффектом: эффект успел
     бы показать кадр с уже сохранённым, но ещё открытым листом. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) close();
  }
  const [seenRemove, setSeenRemove] = useState(removeState);
  if (seenRemove !== removeState) {
    setSeenRemove(removeState);
    if (removeState?.ok) close();
  }

  /* Лист один на список, а набранное в поле своё у каждой строки. Без
     сброса предупреждение «сумма изменилась» переезжало бы вместе с
     листом на соседний расход, которого никто не трогал. */
  const [seenId, setSeenId] = useState(item?.id ?? null);
  if (seenId !== (item?.id ?? null)) {
    setSeenId(item?.id ?? null);
    setDraft('');
  }

  function close() {
    setConfirming(false);
    onClose();
  }

  /* Удаление идёт тем же действием и с тем же полем `id`, что и раньше;
     переход нужен, чтобы `removing` честно отражал летящий запрос. */
  function remove(id: string) {
    startTransition(() => {
      const fd = new FormData();
      fd.set('id', id);
      removeAction(fd);
    });
  }

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const frozen = readOnly || (item?.closed ?? false);
  const changed = item !== null && draft !== '' && draft !== String(item.major);

  return (
    <EntitySheet
      open={item !== null}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      title={item?.category ?? ''}
      /* Второй строки шапки нет: вид расхода и день стоят фактами прямо
         под ней, и подпись повторяла бы их слово в слово. */
      footer={
        frozen ? undefined : (
          <SheetActions
            start={
              <Button variant="destructive-soft" onClick={() => setConfirming(true)}>
                {t.expenses.remove}
              </Button>
            }
          >
            <Button variant="outline" onClick={close}>
              {t.common.cancel}
            </Button>
            <LoadingButton
              form="expense-edit"
              busy={pending}
              label={t.settings.save}
              busyLabel={t.common.saving}
            />
          </SheetActions>
        )
      }
    >
      {item && (
        <div className="flex flex-col gap-5">
          {/* Что это за расход, до того как его начнут править.
              Постоянный называет ещё и дневную долю: без неё «300 000»
              не объясняет, почему в месяце набежало девяносто семь. */}
          <DetailList>
            <DetailRow
              label={t.expenses.detailKind}
              value={item.monthly ? t.expenses.monthly : t.expenses.oneOff}
            />
            <DetailRow
              label={item.monthly ? t.expenses.activeSince : t.expenses.date}
              value={item.closedOn ?? item.day}
              mono
            />
            {item.monthly && (
              <>
                <DetailRow label={t.expenses.accrued} value={money(item.share)} mono />
                <DetailRow label={t.expenses.perDay} value={money(item.perDay)} mono />
              </>
            )}
          </DetailList>

          {frozen ? (
            <FormMessage tone="info">
              {item.closed ? t.expenses.closedNote : t.expenses.pastMonth}
            </FormMessage>
          ) : (
            /* Ключом стоит расход: при переходе к другому поля обязаны
               сброситься, а не донести чужое название и чужую сумму. */
            <form
              key={item.id}
              id="expense-edit"
              action={action}
              onSubmit={(e) => {
                if (pending) e.preventDefault();
              }}
              className="flex flex-col gap-5"
            >
              <input type="hidden" name="id" value={item.id} />

              <FieldGroup>
                <Field>
                  <FieldLabel htmlFor="expense-edit-category">{t.expenses.category}</FieldLabel>
                  <Input
                    id="expense-edit-category"
                    name="category"
                    defaultValue={item.category}
                    required
                    autoComplete="off"
                  />
                </Field>

                <Field>
                  <FieldLabel htmlFor="expense-edit-amount">{t.expenses.amount}</FieldLabel>
                  <InputGroup>
                    <InputGroupAddon>
                      <InputGroupText>{currencySymbol}</InputGroupText>
                    </InputGroupAddon>
                    <InputGroupInput
                      id="expense-edit-amount"
                      name="amount"
                      type="number"
                      inputMode="numeric"
                      min={step}
                      step={step}
                      defaultValue={item.major}
                      onChange={(e) => setDraft(e.target.value)}
                      required
                      className="num font-medium"
                    />
                  </InputGroup>
                  {item.monthly && changed && (
                    <FieldDescription className="text-xs">{t.expenses.changeNote}</FieldDescription>
                  )}
                </Field>

                {/* День правится только у разового: у постоянного это дата,
                    с которой он начал действовать, и сдвинуть её значит
                    переписать прибыль за уже прожитые дни. */}
                {!item.monthly && (
                  <Field>
                    <FieldLabel htmlFor="expense-edit-at">{t.expenses.date}</FieldLabel>
                    <Input
                      id="expense-edit-at"
                      name="at"
                      type="date"
                      defaultValue={item.dayKey}
                      max={today}
                      className="num"
                    />
                  </Field>
                )}
              </FieldGroup>

              <FormMessage tone="error">{state?.error}</FormMessage>
            </form>
          )}

          {/* Подтверждение удаления: текст называет последствие, у
              постоянного и разового оно разное. Ошибка сервера остаётся
              в окне, пока его не закрыли. */}
          {!frozen && (
            <ConfirmDialog
              open={confirming}
              onOpenChange={setConfirming}
              destructive
              title={t.expenses.removeTitle}
              description={item.monthly ? t.expenses.removeMonthlyNote : t.expenses.removeOneOffNote}
              confirmLabel={t.expenses.remove}
              busyLabel={t.common.deleting}
              busy={removing}
              onConfirm={() => remove(item.id)}
            >
              <FormMessage tone="error">{removeState?.error}</FormMessage>
            </ConfirmDialog>
          )}
        </div>
      )}
    </EntitySheet>
  );
}
