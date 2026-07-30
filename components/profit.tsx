import { hy } from '@/lib/i18n/hy';

/**
 * Прибыль и из чего она сложилась.
 *
 * Одной цифры мало: «осталось 46 000» без разбора выглядит как ошибка,
 * особенно в первый раз. Владелец должен увидеть вычитание целиком —
 * тогда он либо соглашается, либо понимает, какой расход забыл завести.
 *
 * Зарплата стоит отдельной строкой от расходов, хотя формально она тоже
 * расход: её считает продукт, а расходы заводит человек, и путать эти
 * два источника нельзя — иначе непонятно, что можно поправить руками.
 */
export function Profit({
  revenue,
  payroll,
  expenses,
  profit,
  money,
}: {
  revenue: number;
  payroll: number;
  expenses: number;
  profit: number;
  money: (n: number) => string;
}) {
  const rows: [string, number][] = [
    [hy.owner.revenue, revenue],
    [hy.owner.payrollAccrued, -payroll],
    [hy.owner.expensesTotal, -expenses],
  ];

  return (
    <div className="card mb-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="label">{hy.owner.profit}</span>
        {/* убыток жёлтым, а не красным: красный в продукте значит
            «удалить», и путать эти два сигнала нельзя */}
        <span
          className={`num text-[26px] leading-none font-bold ${
            profit >= 0 ? 'text-good' : 'text-warn'
          }`}
        >
          {money(profit)}
        </span>
      </div>

      <div className="mt-3 grid gap-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-3 text-[12.5px]">
            <span className="text-muted">{label}</span>
            <span className="num text-muted">
              {value < 0 ? `− ${money(-value)}` : money(value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
