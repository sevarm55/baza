import { Figures, Plate } from '@/components/board';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

/**
 * Результат месяца и его разбор.
 *
 * Та же пара приборов, что на сводке дня и на зарплатах, и намеренно:
 * вопрос устроен одинаково — одно число, ради которого раздел открыт, и
 * слагаемые, объясняющие его. Разные шапки на трёх денежных экранах
 * одного продукта читались бы как три разных расчёта.
 *
 * Раньше здесь стояла полоса из пяти равных звеньев: машины, выручка,
 * зарплата, расходы, итог. Пять чисел одного веса не отвечают на вопрос
 * «сколько я заработал» — на него отвечает одно, и оно должно быть
 * крупнее остальных.
 *
 * Зарплата и расходы ведут в свои разделы: «почему столько» — вопрос,
 * который следует сразу за «сколько», и отвечают на него там.
 */
export function ReportSummary({
  currency,
  revenue,
  payroll,
  costs,
  profit,
  kept,
  monthName,
}: {
  currency: string;
  revenue: number;
  payroll: number;
  costs: number;
  profit: number;
  /** доля, оставшаяся владельцу, целыми процентами */
  kept: number;
  monthName: string;
}) {
  const money = (n: number) => formatMoney(n, currency);

  return (
    <section
      className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={hy.owner.profit}
    >
      <Plate
        label={hy.owner.profit}
        value={money(profit)}
        note={
          profit < 0
            ? `${monthName} · ${hy.owner.inTheRed}`
            : revenue > 0
              ? `${monthName} · ${kept}% ${hy.owner.kept}`
              : monthName
        }
        bad={profit < 0}
      />

      <Figures
        items={[
          { label: hy.owner.revenue, value: money(revenue) },
          {
            label: hy.owner.payrollAccrued,
            value: money(payroll),
            sign: '−',
            href: payroll > 0 ? '/owner/payroll' : undefined,
          },
          {
            label: hy.owner.costs,
            value: money(costs),
            sign: '−',
            href: costs > 0 ? '/owner/expenses' : undefined,
          },
        ]}
      />
    </section>
  );
}
