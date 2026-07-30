import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, startOfDaysAgo } from '@/lib/queries';
import { currencySymbol, formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { EXPENSE_HINTS, getPeriodCosts, listExpenses } from '@/lib/expenses';
import { removeExpenseAction } from '@/app/actions';
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

  const from = startOfDaysAgo(tenant.timezone, 29);
  const [rows, costs] = await Promise.all([
    listExpenses(tenant.id, from),
    getPeriodCosts(tenant.id, from),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);

  return (
    <>
      <h2 className="h-section !mt-0">{hy.expenses.title}</h2>

      <div className="card mb-3.5 flex items-baseline justify-between gap-3">
        <span className="label">{hy.owner.expensesTotal}</span>
        <span className="num text-[22px] leading-none font-bold">{money(costs.total)}</span>
      </div>

      <AddExpenseForm currencySymbol={currencySymbol(tenant.currency)} hints={EXPENSE_HINTS} />

      <p className="note mt-3.5">{hy.expenses.note}</p>

      <div className="list mt-4">
        {rows.length === 0 ? (
          <div className="li text-muted">{hy.expenses.empty}</div>
        ) : (
          rows.map((e) => (
            <div key={e.id} className="li">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{e.category}</div>
                <div className="text-[12.5px] text-muted">
                  {e.monthly ? hy.expenses.perMonth : isoDate(e.at)}
                </div>
              </div>
              <div className="num shrink-0 text-[14.5px] font-semibold">{money(e.amount)}</div>
              <form action={removeExpenseAction} className="shrink-0">
                <input type="hidden" name="id" value={e.id} />
                <button className="btn-inline btn-inline-danger">{hy.expenses.remove}</button>
              </form>
            </div>
          ))
        )}
      </div>
    </>
  );
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
