'use client';

import { useState } from 'react';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { Segmented } from '@/components/segmented';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { AddExpense } from './add-expense';
import { ExpenseSheet } from './expense-sheet';
import type { ExpenseDay, ExpenseItem } from './model';

type Kind = 'all' | 'monthly' | 'oneOff';

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
  const [kind, setKind] = useState<Kind>('all');
  const [open, setOpen] = useState<string | null>(null);

  const money = (n: number) => formatMoney(n, currency);
  const all = [...monthly, ...days.flatMap((d) => d.items)];
  const item = all.find((x) => x.id === open) ?? null;

  if (all.length === 0) {
    return (
      <Panel>
        <EmptyState
          title={hy.expenses.empty}
          note={hy.expenses.emptyNote}
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

  /* Переключатель появляется, только когда есть что переключать: на
     месяце из одних разовых он ничего не меняет, и это приходится
     прочитать, чтобы понять. */
  const both = monthly.length > 0 && oneOffCount > 0;
  const showMonthly = kind !== 'oneOff' && monthly.length > 0;
  const showOneOff = kind !== 'monthly' && oneOffCount > 0;

  return (
    <div className="grid gap-[var(--seam)]">
      {both && (
        <Segmented
          id="expense-kind"
          current={kind}
          onSelect={(key) => setKind(key as Kind)}
          label={hy.expenses.kind}
          items={[
            { key: 'all', label: hy.today.all, count: all.length },
            { key: 'monthly', label: hy.expenses.monthly, count: monthly.length },
            { key: 'oneOff', label: hy.expenses.oneOff, count: oneOffCount },
          ]}
        />
      )}

      {showMonthly && (
        <Panel title={hy.expenses.monthlyOnes} count={monthly.length}>
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
          <p className="note mt-3">{hy.expenses.note}</p>
        </Panel>
      )}

      {showOneOff && (
        <Panel title={hy.expenses.oneOffs} count={oneOffCount}>
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
  const money = (n: number) => formatMoney(n, currency);

  const body = (
    <>
      <span className="min-w-0">
        <span className="block truncate text-[15px] font-medium">{item.category}</span>
        {item.monthly ? (
          <span className="num block truncate text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
            {hy.expenses.accrued} {money(item.share)} · {hy.expenses.perDay} {money(item.perDay)}
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
            {hy.expenses.perMonth}
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
