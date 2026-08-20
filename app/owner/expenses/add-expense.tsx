'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { addExpenseAction, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { LoadingButton } from '@/components/loading';
import { useT } from '@/lib/i18n/client';

/**
 * Новый расход.
 *
 * Форма занимала правую колонку страницы всегда — треть ширины под
 * четыре поля, которые нужны раз в неделю. Список расходов при этом жил
 * в оставшихся двух третях и на широком мониторе выглядел колонкой в
 * середине экрана. Теперь форма приходит по нажатию и уходит, а список
 * занимает всю ширину.
 *
 * Порядок полей — как в чеке: сколько → за что → какой это расход.
 * Готовые названия лежат фишками: нажать готовое быстрее, чем набрать
 * армянское слово, а своё при этом никто не запрещает.
 *
 * Вид расхода выбирается двумя карточками, и от него зависит остальное.
 * Разовый спрашивает день — расходы заводят пачкой, за всю неделю сразу,
 * и без даты вся неделя ложится сегодняшним числом. Постоянный дня не
 * спрашивает вовсе: он начинает действовать с сегодняшнего и дальше
 * набегает сам, и об этом сказано прямо в форме, а не выяснено потом по
 * несходящейся прибыли.
 */
export function AddExpense({
  currencySymbol,
  hints,
  /** «2026-08-15» в поясе бизнеса: расход задним числом можно, вперёд нельзя */
  today,
  /** в заголовке раздела — тихой кнопкой, в пустом месте — главной */
  variant = 'head',
  /**
   * Открыть форму сразу.
   *
   * Сюда приводит быстрое действие со сводки: расход записывают, стоя у
   * кассы с чеком в руке, и лишний экран между намерением и полем суммы
   * — это тот самый шаг, на котором расход не записывают вовсе.
   *
   * Только начальное состояние, а не управление: закрыл — закрыто, и
   * адрес с этим не спорит. Иначе форма возвращалась бы на каждый шаг
   * «назад» в истории браузера.
   */
  openNew = false,
}: {
  currencySymbol: string;
  hints: readonly string[];
  today: string;
  variant?: 'head' | 'cta';
  openNew?: boolean;
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(addExpenseAction, null);
  const [open, setOpen] = useState(openNew);
  const [category, setCategory] = useState('');
  const [monthly, setMonthly] = useState(false);

  /* Поля, которыми управляет React, чистятся при отрисовке нового
     ответа, а не в эффекте: состояние, поставленное из эффекта,
     заставляет React рисовать кадр дважды — сначала со старым
     значением, потом с пустым. */
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) {
      setCategory('');
      setMonthly(false);
      setOpen(false);
    }
  }

  return (
    <>
      {/* В заголовке — тихой кнопкой, в пустом месте — лаймовой.
          Лайм в продукте значит «единственное, что здесь жмут»; в шапке
          рядом с переключателем месяца он спорит с ним за внимание и
          превращает управление разделом в две кнопки одинакового веса.
          В пустом месте нажать действительно больше нечего. */}
      <button
        type="button"
        className={variant === 'cta' ? 'btn btn-auto' : 'btn-inline'}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden />
        {t.expenses.addExpense}
      </button>

      {/* Действие стоит в подвале окна, а не в конце формы.

          На телефоне окно занимает экран целиком, а с поднятой
          клавиатурой от него остаётся половина: кнопка в конце формы
          уезжает под клавиатуру, и «Ավելացնել» приходится искать
          прокруткой каждый раз. Подвал не прокручивается вовсе и стоит
          над безопасной зоной. Так же заканчивается окно новой услуги —
          два окна одного продукта не должны заканчиваться по-разному.

          Кнопка связана с формой атрибутом `form`, как это и задумано в
          HTML: вкладывать формы друг в друга или поднимать всю форму в
          подвал ради одной кнопки не приходится. */}
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        side
        title={t.expenses.addExpense}
        footer={
          <>
            <button type="button" className="btn-inline" onClick={() => setOpen(false)}>
              {t.common.cancel}
            </button>
            <LoadingButton
              form="expense-new"
              className="btn btn-auto"
              busy={pending}
              label={t.expenses.add}
              busyLabel={t.common.adding}
            />
          </>
        }
      >
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлым недописанным расходом. */}
        <form
          key={String(open)}
          id="expense-new"
          action={action}
          onSubmit={(e) => {
            if (pending) e.preventDefault();
          }}
          className="grid gap-3.5"
        >
          {/* Сумма первой и крупно: с ней приходят. Название вспоминают
              уже после того, как посмотрели в чек. */}
          <label className="grid gap-1.5">
            <span className="label">{t.expenses.amount}</span>
            <div className="relative">
              <input
                className="field auth-field num !ps-9 !text-[19px] !font-semibold"
                name="amount"
                type="number"
                inputMode="numeric"
                min={1}
                placeholder="0"
                required
                autoFocus
              />
              <span className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[16px] text-faint">
                {currencySymbol}
              </span>
            </div>
          </label>

          <div className="grid gap-2">
            <span className="label">{t.expenses.category}</span>

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
              placeholder={t.expenses.category}
              required
              autoComplete="off"
            />
          </div>

          <div className="grid gap-2">
            <span className="label">{t.expenses.kind}</span>
            <div className="kind">
              <Kind
                title={t.expenses.oneOff}
                note={t.expenses.kindOneNote}
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
                title={t.expenses.monthly}
                note={t.expenses.kindMonthlyNote}
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
            {/* Флажка нет, но действие ждёт того же имени: карточки — это
                он и есть, только читаемый. */}
            {monthly && <input type="hidden" name="monthly" value="on" />}
          </div>

          {monthly ? (
            <p className="note">{t.expenses.monthlyStartNote}</p>
          ) : (
            <label className="grid gap-1.5">
              <span className="label">{t.expenses.date}</span>
              <input
                className="field num"
                name="at"
                type="date"
                defaultValue={today}
                max={today}
              />
            </label>
          )}

          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
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
    <button
      type="button"
      className="kind-card"
      data-on={on ? '' : undefined}
      onClick={onPick}
      aria-pressed={on}
    >
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
