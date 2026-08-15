import { Figures, Plate } from '@/components/board';
import { formatMoney, formatShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

/**
 * Ответ расходов и его разбор.
 *
 * Раньше здесь стояла полоса из трёх равных звеньев со знаками «+» и
 * «=»: постоянные, разовые, итог. Формально порядок в ней был, но веса
 * у чисел почти одинаковые, и первым читалось не то, ради чего раздел
 * открывают, а то, что стояло левее.
 *
 * Иерархия здесь та же, что на сводке и зарплатах, и это не подражание:
 * вопрос устроен одинаково. Одно число — сколько ушло за месяц, — и три
 * тише его, объясняющие, из чего оно сложилось: сколько набежало с
 * постоянных, сколько потрачено разово и сколько выходит в день.
 *
 * Доля от выручки стоит под итогом, потому что расход сам по себе не
 * плохой и не хороший: сто тысяч при выручке в миллион — это десять
 * процентов и обычный месяц, а при выручке в двести — это беда. Число
 * появляется только когда есть выручка: процент от нуля не существует.
 */
export function ExpensesSummary({
  currency,
  total,
  monthlyShare,
  monthlyNominal,
  oneOff,
  perDay,
  revenue,
  monthName,
}: {
  currency: string;
  /** сколько ушло за период — считает `getPeriodCosts` */
  total: number;
  monthlyShare: number;
  /** номинал действующих постоянных: из чего набежала доля */
  monthlyNominal: number;
  oneOff: number;
  /** средний расход в день по прожитым дням периода */
  perDay: number;
  revenue: number;
  /** «օգոստոս» — под каким числом стоит итог */
  monthName: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const share = revenue > 0 ? formatShare(total, revenue) : null;

  return (
    <section
      /* Порог тот же, что у сводки и зарплат: до 1024 плита и полоса
         идут друг под другом, иначе числа и подписи обрезаются. */
      className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={hy.expenses.title}
    >
      <Plate
        label={hy.expenses.title}
        value={money(total)}
        note={
          share !== null ? `${monthName} · ${hy.expenses.shareOfRevenue(share)}` : monthName
        }
      />

      <Figures
        items={[
          {
            label: hy.expenses.monthlyAccrued,
            value: money(monthlyShare),
            /* Под накопленной долей стоит номинал, иначе число не с чем
               сверить: «19 355» само по себе не говорит ничего,
               «19 355 из 300 000» говорит всё. */
            note: monthlyNominal > 0 ? hy.expenses.outOf(money(monthlyNominal)) : undefined,
          },
          { label: hy.expenses.oneOffs, value: money(oneOff) },
          { label: hy.expenses.perDayAvg, value: money(perDay) },
        ]}
      />
    </section>
  );
}
