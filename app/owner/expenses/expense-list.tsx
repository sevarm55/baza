'use client';

import { useState } from 'react';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { formatMoney } from '@/lib/money';
import { AddExpense } from './add-expense';
import { ExpenseSheet } from './expense-sheet';
import type { ExpenseDay, ExpenseItem } from './model';
import { useT } from '@/lib/i18n/client';

/**
 * Расходы списком: постоянные отдельно, разовые по дням.
 *
 * Раньше это был один список, в котором аренда и канистра химии
 * различались словом «ամսական» мелким шрифтом под названием — то есть
 * не различались вовсе. Между тем это разные деньги и разные решения:
 * постоянный уходит каждый месяц сам и его либо терпят, либо
 * пересматривают договор; разовый случился один раз и завтра его может
 * не быть.
 *
 * Постоянные стоят первыми и без дат: у них нет «когда», у них есть
 * «сколько в месяц». В строке два числа — номинал справа и то, что уже
 * набежало, тише под названием: одного номинала мало десятого числа,
 * одной доли мало всегда.
 *
 * Разовые собраны по дням, как записи на зарплатах: «сегодня потратил
 * столько» — вопрос, который задают вслух, а список без дат на него не
 * отвечает. Дата стоит в заголовке дня, а не повторяется в каждой
 * строке.
 */
export function ExpenseList({
  monthly,
  days,
  oneOffCount,
  currency,
  currencySymbol,
  hints,
  step,
  today,
  readOnly,
}: {
  monthly: ExpenseItem[];
  days: ExpenseDay[];
  oneOffCount: number;
  currency: string;
  currencySymbol: string;
  hints: readonly string[];
  step: number;
  /** «2026-08-15» в поясе бизнеса */
  today: string;
  /** закрытый месяц: его строки нельзя менять задним числом */
  readOnly: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency, t.locale);
  const all = [...monthly, ...days.flatMap((d) => d.items)];
  const item = all.find((x) => x.id === open) ?? null;

  if (all.length === 0) {
    return (
      <Panel>
        <EmptyState
          title={t.expenses.empty}
          note={t.expenses.emptyNote}
          action={
            readOnly ? undefined : (
              <AddExpense
                variant="cta"
                currencySymbol={currencySymbol}
                hints={hints}
                today={today}
              />
            )
          }
        />
      </Panel>
    );
  }

  /* Переключателя вида здесь больше нет, и это не упрощение ради
     упрощения.

     Он стоял над двумя панелями, которые обе видны на экране, и прятал
     одну из них. Фильтр, который ничего не находит, а только убирает с
     глаз то, что и так помещается, приходится прочитать и попробовать,
     чтобы понять, что он не нужен. На странице, где над ним уже стояли
     месяцы, получалось два ряда вкладок подряд — и первый вопрос к
     экрану был не «куда ушли деньги», а «чем эти вкладки отличаются».

     Постоянные и разовые теперь просто стоят рядом: слева то, что
     уходит каждый месяц само, справа то, что потратили руками. Разница
     между ними — это разные колонки, а не разные состояния фильтра. */
  const showMonthly = monthly.length > 0;
  const showOneOff = oneOffCount > 0;

  return (
    <div className="grid items-start gap-[var(--seam)] lg:grid-cols-12">
      {showMonthly && (
        <Panel
          title={t.expenses.monthlyOnes}
          count={monthly.length}
          className={showOneOff ? 'lg:col-span-5' : 'lg:col-span-12'}
        >
          <div className="rows">
            {monthly.map((e) => (
              <Line
                key={e.id}
                item={e}
                currency={currency}
                currencySymbol={currencySymbol}
                onOpen={() => setOpen(e.id)}
              />
            ))}
          </div>

          {/* Как считается постоянный расход — сноской под теми строками,
              к которым она относится, а не подписью раздела наверху. */}
          <p className="note mt-3">{t.expenses.note}</p>
        </Panel>
      )}

      {showOneOff && (
        <Panel
          title={t.expenses.oneOffs}
          count={oneOffCount}
          className={showMonthly ? 'lg:col-span-7' : 'lg:col-span-12'}
        >
          {days.map((day) => (
            <section key={day.key} className="expense-day">
              {/* Итог дня — только когда трат в нём несколько: под одной
                  строкой он повторял бы её же число. */}
              <h3 className="day-head">
                <span>{day.title}</span>
                {day.items.length > 1 && <b className="num">{money(day.total)}</b>}
              </h3>
              <div className="rows">
                {day.items.map((e) => (
                  <Line
                    key={e.id}
                    item={e}
                    currency={currency}
                    currencySymbol={currencySymbol}
                    onOpen={() => setOpen(e.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </Panel>
      )}

      <ExpenseSheet
        item={item}
        currency={currency}
        currencySymbol={currencySymbol}
        step={step}
        today={today}
        readOnly={readOnly}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

/**
 * Строка расхода.
 *
 * У постоянного справа стоит номинал — то, о чём договорились с
 * арендодателем, — а под названием то, что из него уже набежало и
 * сколько это в сутки. У разового справа сама трата, и второй строки
 * нет: день назван заголовком группы, и повторять его под каждой
 * строкой значит написать одну и ту же дату шесть раз подряд.
 */
function Line({
  item,
  currency,
  currencySymbol,
  onOpen,
}: {
  item: ExpenseItem;
  currency: string;
  currencySymbol: string;
  onOpen: () => void;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{item.category}</span>
        {item.monthly ? (
          <span className="num block truncate text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
            {t.expenses.accrued} {money(item.share)} · {t.expenses.perDay} {money(item.perDay)}
            {item.closedOn && ` · ${item.closedOn}`}
          </span>
        ) : (
          item.note && (
            <span className="block truncate text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
              {item.note}
            </span>
          )
        )}
      </span>

      <span className="num shrink-0 text-end text-[15px]">
        {item.display} <span className="text-faint">{currencySymbol}</span>
        {item.monthly && (
          <span className="block text-[11.5px] font-normal" style={{ color: 'var(--board-muted)' }}>
            {t.expenses.perMonth}
          </span>
        )}
      </span>
    </>
  );

  /* Открывается и в закрытом месяце. Править там нечего, но карточка
     отвечает на то, чего в строке нет: с какого дня действовал расход,
     сколько из него набежало и почему он вообще попал в этот месяц. */
  return (
    <button type="button" className="row-open" onClick={onOpen} aria-label={item.category}>
      {body}
    </button>
  );
}
