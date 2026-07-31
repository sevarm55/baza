import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, startOfDay, startOfDaysAgo } from '@/lib/queries';
import { currencySymbol, formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { EXPENSE_HINTS, getPeriodCosts, listExpenses } from '@/lib/expenses';
import { ExpenseRow } from '@/components/expense-row';
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
    getPeriodCosts(tenant.id, from, to),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  // у драма нет копеек, у рубля есть — шаг ввода берём из валюты
  const step = toMajor(1, tenant.currency);

  return (
    <>
      <h2 className="h-section !mt-0">{hy.expenses.title}</h2>

      <div className="card mb-3.5 flex items-baseline justify-between gap-3">
        <span className="label">{hy.owner.expensesTotal}</span>
        <span className="num text-[22px] leading-none font-bold">{money(costs.total)}</span>
      </div>

      <AddExpenseForm currencySymbol={currencySymbol(tenant.currency)} hints={EXPENSE_HINTS} />

      <p className="note mt-3.5">{hy.expenses.note}</p>

      {/* Между расходами воздуха больше, чем внутри строки: на телефоне
          строка переносится, и без этого не видно, где кончается аренда
          и начинается химия. Ровно та же причина, что у списка услуг. */}
      <div className="mt-4 grid gap-4">
        {rows.length === 0 ? (
          <div className="text-sm text-faint">{hy.expenses.empty}</div>
        ) : (
          rows.map((e) => (
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
          ))
        )}
      </div>
    </>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
