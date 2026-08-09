import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, startOfDay, startOfDaysAgo } from '@/lib/queries';
import { currencySymbol, formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { EXPENSE_HINTS, getPeriodCosts, listExpenses } from '@/lib/expenses';
import { daysInMonthOf } from '@/lib/time';
import { ExpenseRow } from '@/components/expense-row';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { AddExpenseForm } from './add-expense-form';

/**
 * Расходы бизнеса.
 *
 * Показываем за 30 дней — тот же горизонт, что у выгрузки и у вкладки
 * периода. Постоянные при этом видны всегда: аренда, заведённая полгода
 * назад, действует и сегодня, и не найти её в списке было бы странно.
 */
export default async function ExpensesPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  /* Те же границы, что у вкладки «30 дней» в кабинете: тридцать целых
     суток, включая сегодняшние. Без верхней границы аренда копала бы
     по часам, и итог здесь не сошёлся бы с расходами на соседнем
     экране — на пару тысяч, ровно на недожитую часть дня. */
  const from = startOfDaysAgo(tenant.timezone, 29);
  const to = new Date(startOfDay(tenant.timezone).getTime() + 86_400_000);

  const [rows, costs] = await Promise.all([
    listExpenses(tenant.id, from),
    getPeriodCosts(tenant.id, from, to, daysInMonthOf(tenant.timezone, new Date())),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  // у драма нет копеек, у рубля есть — шаг ввода берём из валюты
  const step = toMajor(1, tenant.currency);

  /* Слева заводят расход, справа он тут же появляется в списке. На
     телефоне форма стояла над списком и уезжала вверх, стоило начать
     листать; на широком экране она остаётся на месте, потому что
     расходы заводят пачкой — раз в неделю за всю неделю. */
  return (
    <>
      <PageHead title={hy.expenses.title} meta={hy.expenses.note} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Panel>
            <div className="flex items-baseline justify-between gap-3">
              <span className="label">{hy.owner.expensesTotal}</span>
              <span className="num text-[24px] leading-none font-semibold tracking-[-0.03em]">
                {money(costs.total)}
              </span>
            </div>
          </Panel>

          <Panel title={hy.expenses.add}>
            <AddExpenseForm
              currencySymbol={currencySymbol(tenant.currency)}
              hints={EXPENSE_HINTS}
            />
          </Panel>
        </div>

        <Panel title={hy.expenses.title} count={rows.length} className="lg:col-span-8">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-faint">{hy.expenses.empty}</p>
          ) : (
            /* Тот же список, что у услуг: линия между строками вместо
               воздуха, правка проявляется под курсором. */
            <div className="rows">
              {rows.map((e) => (
                <ExpenseRow
                  key={e.id}
                  id={e.id}
                  category={e.category}
                  amount={toMajor(e.amount, tenant.currency)}
                  monthly={e.monthly}
                  when={e.monthly ? hy.expenses.perMonth : isoDate(e.at)}
                  currencySymbol={currencySymbol(tenant.currency)}
                  step={step}
                />
              ))}
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
