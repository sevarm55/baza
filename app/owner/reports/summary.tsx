import { Figures, Plate, signOf } from '@/components/board';
import { formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';

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
export async function ReportSummary({
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
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <section
      className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={t.owner.profit}
    >
      <Plate
        label={t.owner.profit}
        value={money(profit)}
        note={
          profit < 0
            ? `${monthName} · ${t.owner.inTheRed}`
            : revenue > 0
              ? `${monthName} · ${kept}% ${t.owner.kept}`
              : monthName
        }
        sign={signOf(profit)}
      />

      <Figures
        items={[
          { label: t.owner.revenue, value: money(revenue) },
          {
            label: t.owner.payrollAccrued,
            value: money(payroll),
            sign: '−',
            href: payroll > 0 ? '/owner/payroll' : undefined,
          },
          {
            label: t.owner.costs,
            value: money(costs),
            sign: '−',
            href: costs > 0 ? '/owner/expenses' : undefined,
          },
        ]}
      />
    </section>
  );
}
