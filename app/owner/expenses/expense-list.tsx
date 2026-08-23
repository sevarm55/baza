'use client';

import { useState } from 'react';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { formatMoney } from '@/lib/money';
import { useT } from '@/lib/i18n/client';
import { AddExpense } from './add-expense';
import { ExpenseSheet } from './expense-sheet';
import type { ExpenseDay, ExpenseItem } from './model';

/**
 * Расходы списком: постоянные отдельно, разовые по дням.
 *
 * Аренда и канистра химии это разные деньги и разные решения:
 * постоянный уходит каждый месяц сам, разовый случился один раз. Поэтому
 * две панели рядом, а не один список с пометкой мелким шрифтом.
 *
 * Постоянные стоят без дат: у них нет «когда», у них есть «сколько в
 * месяц». В строке два числа: номинал справа и то, что уже набежало,
 * тише под названием. Разовые собраны по дням: «сегодня потратил
 * столько» это вопрос, который задают вслух.
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
      <EmptyState
        title={t.expenses.empty}
        description={t.expenses.emptyNote}
        action={
          !readOnly && (
            <AddExpense
              variant="outline"
              currencySymbol={currencySymbol}
              hints={hints}
              today={today}
            />
          )
        }
      />
    );
  }

  /* Пустая панель не рисуется: соседняя занимает всю ширину. */
  const showMonthly = monthly.length > 0;
  const showOneOff = oneOffCount > 0;

  return (
    <>
      <PanelGrid className="items-start">
        {showMonthly && (
          <Panel
            title={t.expenses.monthlyOnes}
            count={monthly.length}
            padded={false}
            className={showOneOff ? 'lg:col-span-5' : 'lg:col-span-12'}
          >
            <div className="divide-y divide-border">
              {monthly.map((e) => (
                <ExpenseRow
                  key={e.id}
                  item={e}
                  currencySymbol={currencySymbol}
                  money={money}
                  onOpen={() => setOpen(e.id)}
                />
              ))}
            </div>
            {/* Как считается постоянный расход: сноской под теми строками,
                к которым она относится. */}
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              {t.expenses.note}
            </p>
          </Panel>
        )}

        {showOneOff && (
          <Panel
            title={t.expenses.oneOffs}
            count={oneOffCount}
            padded={false}
            className={showMonthly ? 'lg:col-span-7' : 'lg:col-span-12'}
          >
            <div className="divide-y divide-border">
              {days.map((day) => (
                <section key={day.key}>
                  {/* Итог дня только когда трат несколько: под одной
                      строкой он повторял бы её же число. */}
                  <h3 className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                    <span className="truncate">{day.title}</span>
                    {day.items.length > 1 && (
                      <span className="num shrink-0">{money(day.total)}</span>
                    )}
                  </h3>
                  <div className="divide-y divide-border border-t border-border">
                    {day.items.map((e) => (
                      <ExpenseRow
                        key={e.id}
                        item={e}
                        currencySymbol={currencySymbol}
                        money={money}
                        onOpen={() => setOpen(e.id)}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </Panel>
        )}
      </PanelGrid>

      <ExpenseSheet
        item={item}
        currency={currency}
        currencySymbol={currencySymbol}
        step={step}
        today={today}
        readOnly={readOnly}
        onClose={() => setOpen(null)}
      />
    </>
  );
}

/**
 * Строка расхода.
 *
 * У постоянного справа номинал, а под названием то, что из него уже
 * набежало и сколько это в сутки. У разового справа сама трата, и
 * второй строки нет: день назван заголовком группы.
 *
 * Открывается и в закрытом месяце: править там нечего, но карточка
 * отвечает, с какого дня действовал расход и сколько из него набежало.
 */
function ExpenseRow({
  item,
  currencySymbol,
  money,
  onOpen,
}: {
  item: ExpenseItem;
  currencySymbol: string;
  money: (n: number) => string;
  onOpen: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center gap-3 px-4 py-3 text-left outline-none transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:ring-inset"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.category}</span>
        {item.monthly ? (
          <span className="num block truncate text-xs text-muted-foreground">
            {t.expenses.accrued} {money(item.share)} · {t.expenses.perDay} {money(item.perDay)}
            {item.closedOn && ` · ${item.closedOn}`}
          </span>
        ) : (
          item.note && (
            <span className="block truncate text-xs text-muted-foreground">{item.note}</span>
          )
        )}
      </span>

      <span className="shrink-0 text-right">
        <span className="num block text-sm font-semibold">
          {item.display} <span className="font-normal text-muted-foreground">{currencySymbol}</span>
        </span>
        {item.monthly && (
          <span className="block text-xs text-muted-foreground">{t.expenses.perMonth}</span>
        )}
      </span>
    </button>
  );
}
