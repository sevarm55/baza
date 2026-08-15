'use client';

import { useActionState, useState } from 'react';
import { removeExpenseAction, saveExpenseAction, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { formatMoney } from '@/lib/money';
import type { ExpenseItem } from './model';
import { useT } from '@/lib/i18n/client';

/**
 * Карточка расхода: что это было и что с этим можно сделать.
 *
 * Панель одна на весь список, а не своя у каждой строки: форма тут одна
 * и та же, а тридцать скрытых форм в разметке — это тридцать состояний,
 * которые надо держать согласованными без единой причины.
 *
 * Сверху факты, ниже правка. Отдельного шага «сначала посмотреть, потом
 * нажать изменить» нет намеренно: сюда приходят с одним из двух дел —
 * исправить опечатку или убрать лишнее, — и лишнее нажатие перед каждым
 * из них ничего не объясняет. Факты при этом на месте: тип расхода,
 * день и — у постоянного — сколько из него уже набежало.
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
  /** какой расход открыт; `null` — панель закрыта */
  item: ExpenseItem | null;
  currency: string;
  currencySymbol: string;
  /** шаг ввода: у драма нет копеек, у рубля есть */
  step: number;
  /** «2026-08-15» в поясе бизнеса: дальше этого дня расход не заводят */
  today: string;
  /** закрытый месяц и закрытые постоянные — история, её не правят */
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
     бы показать кадр с уже сохранённым, но ещё открытым окном. */
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

  /* Панель одна на список, а набранное в поле — своё у каждой строки.
     Без сброса предупреждение «сумма изменилась» переезжало бы вместе с
     панелью на соседний расход, которого никто не трогал. */
  const [seenId, setSeenId] = useState(item?.id ?? null);
  if (seenId !== (item?.id ?? null)) {
    setSeenId(item?.id ?? null);
    setDraft('');
  }

  function close() {
    setConfirming(false);
    onClose();
  }

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const frozen = readOnly || (item?.closed ?? false);
  const changed = item !== null && draft !== '' && draft !== String(item.major);

  return (
    <Sheet
      open={item !== null}
      onClose={close}
      side
      title={item?.category ?? ''}
      /* Второй строки шапки нет: вид расхода и день стоят фактами прямо
         под ней, и подпись повторяла бы их слово в слово. */
      footer={
        frozen ? undefined : confirming ? (
          <>
            <button
              type="button"
              className="btn-inline me-auto"
              onClick={() => setConfirming(false)}
              disabled={removing}
            >
              {t.common.cancel}
            </button>
            <button form="expense-remove" className="btn-inline btn-inline-danger" disabled={removing}>
              {removing ? t.common.loading : t.expenses.remove}
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="btn-inline btn-inline-danger me-auto"
              onClick={() => setConfirming(true)}
            >
              {t.expenses.remove}
            </button>
            <button form="expense-edit" className="btn btn-auto" disabled={pending}>
              {pending ? t.common.loading : t.settings.save}
            </button>
          </>
        )
      }
    >
      {item && (
        <>
          {/* Что это за расход — до того, как его начнут править.
              Постоянный называет ещё и дневную долю: без неё «300 000»
              не объясняет, почему в месяце набежало девяносто семь. */}
          <dl className="facts">
            <div>
              <dt>{t.expenses.detailKind}</dt>
              <dd>{item.monthly ? t.expenses.monthly : t.expenses.oneOff}</dd>
            </div>
            <div>
              <dt>{item.monthly ? t.expenses.activeSince : t.expenses.date}</dt>
              <dd className="num">{item.closedOn ?? item.day}</dd>
            </div>
            {item.monthly && (
              <>
                <div>
                  <dt>{t.expenses.accrued}</dt>
                  <dd className="num">{money(item.share)}</dd>
                </div>
                <div>
                  <dt>{t.expenses.perDay}</dt>
                  <dd className="num">{money(item.perDay)}</dd>
                </div>
              </>
            )}
          </dl>

          {confirming ? (
            <div className="mt-4 grid gap-3">
              <p className="text-[14px] font-semibold">{t.expenses.removeTitle}</p>
              <p className="note">
                {item.monthly ? t.expenses.removeMonthlyNote : t.expenses.removeOneOffNote}
              </p>
              {removeState?.error && <p className="alert">{removeState.error}</p>}
            </div>
          ) : frozen ? (
            <p className="note mt-4">
              {item.closed ? t.expenses.closedNote : t.expenses.pastMonth}
            </p>
          ) : (
            /* Ключом стоит расход: при переходе к другому поля обязаны
               сброситься, а не донести чужое название и чужую сумму. */
            <form key={item.id} id="expense-edit" action={action} className="mt-4 grid gap-3">
              <input type="hidden" name="id" value={item.id} />

              <label className="grid gap-1.5">
                <span className="label">{t.expenses.category}</span>
                <input
                  className="field"
                  name="category"
                  defaultValue={item.category}
                  required
                  autoFocus
                />
              </label>

              <label className="grid gap-1.5">
                <span className="label">{t.expenses.amount}</span>
                <div className="relative">
                  <input
                    className="field num !ps-8"
                    name="amount"
                    type="number"
                    inputMode="numeric"
                    min={step}
                    step={step}
                    defaultValue={item.major}
                    onChange={(e) => setDraft(e.target.value)}
                    required
                  />
                  <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                    {currencySymbol}
                  </span>
                </div>
              </label>

              {/* День правится только у разового: у постоянного это дата,
                  с которой он начал действовать, и сдвинуть её значит
                  переписать прибыль за уже прожитые дни. */}
              {!item.monthly && (
                <label className="grid gap-1.5">
                  <span className="label">{t.expenses.date}</span>
                  <input
                    className="field num"
                    name="at"
                    type="date"
                    defaultValue={item.dayKey}
                    max={today}
                  />
                </label>
              )}

              {item.monthly && changed && <p className="note">{t.expenses.changeNote}</p>}
              {state?.error && <p className="alert">{state.error}</p>}
            </form>
          )}

          <form id="expense-remove" action={removeAction} className="hidden">
            <input type="hidden" name="id" value={item.id} />
          </form>
        </>
      )}
    </Sheet>
  );
}
