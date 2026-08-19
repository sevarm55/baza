import { Figures, Plate, signOf } from '@/components/board';
import { formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { fromOneUnit } from '@/lib/i18n/terms';

/**
 * Ответ дня и его разбор.
 *
 * Раньше здесь стояла полоса из пяти равных звеньев: выручка, зарплата,
 * расходы, итог и счётчик машин. Формально в ней был порядок — между
 * звеньями стояли знаки, — но веса у чисел были почти одинаковые, и
 * первым читалось не то, ради чего кабинет открывают, а то, что стояло
 * левее.
 *
 * Здесь иерархия жёсткая. Плита слева отвечает на единственный вопрос
 * владельца — «сколько мне остаётся», — и второго такого числа на экране
 * нет. Три слагаемых справа стоят втрое тише и объясняют плиту: приход,
 * минус люди, минус траты. Знаки «−» настоящие, поэтому вычитание видно
 * без единого слова.
 *
 * Ни одно из этих чисел ниже по странице не повторяется: график
 * показывает ход, а не сумму, лента — записи, а не итог дня.
 */
export async function TodaySummary({
  currency,
  unitOne,
  revenue,
  payroll,
  costs,
  oneOff,
  monthlyShare,
  profit,
  count,
}: {
  currency: string;
  unitOne: string;
  revenue: number;
  payroll: number;
  /** разовые плюс дневная доля постоянных — так их считает бэкенд */
  costs: number;
  oneOff: number;
  monthlyShare: number;
  /** считает `profitOf`, а не эта страница */
  profit: number;
  count: number;
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  /* Доля и «с одной машины» — то, что превращает сумму в оценку дня.
     Обе считаются только когда есть от чего: процент от нуля и деление
     на ноль дают числа, которых не было. */
  const kept = revenue > 0 ? Math.round((profit / revenue) * 100) : null;
  const perUnit = count > 0 ? Math.round(profit / count) : null;

  const note =
    profit < 0
      ? t.owner.inTheRed
      : [
          kept !== null ? `${kept}% ${t.owner.kept}` : null,
          perUnit !== null ? `${money(perUnit)} ${fromOneUnit(unitOne, t.locale)}` : null,
        ]
          .filter(Boolean)
          .join(' · ') || undefined;

  return (
    /* Рядом только на широком экране.

       Порог был на 640, и между планшетом и ноутбуком полоса слагаемых
       получала треть узкого полотна на три числа: «1 340 000 ֏»
       обрезалось до «1 340 0…», а подпись «Աշխատավարձ» — до «Աշխատա…».
       Обрезанное число хуже мелкого: по нему нельзя понять даже
       порядок. До 1024 плита и слагаемые идут друг под другом во всю
       ширину, и всё помещается целиком. */
    <section
      className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={t.owner.profit}
    >
      <Plate label={t.owner.profit} value={money(profit)} note={note} sign={signOf(profit)} />

      <Figures
        items={[
          { label: t.owner.revenue, value: money(revenue) },
          {
            label: t.owner.payrollAccrued,
            value: money(payroll),
            sign: '−',
            /* Ведёт на зарплаты: сводка называет сумму, а кому и за какой
               день из неё причитается — вопрос отдельной страницы, и
               превращать сводку в её копию незачем. */
            href: payroll > 0 ? '/owner/payroll' : undefined,
          },
          {
            label: t.owner.costs,
            value: money(costs),
            sign: '−',
            /* Разовые и доля постоянных — разные вещи: первое случилось
               сегодня, второе набегает каждый день само. Пока и того и
               другого нет, подписи тоже нет: «0 + 0» ничего не сообщает. */
            note:
              costs > 0 && oneOff > 0 && monthlyShare > 0
                ? `${money(oneOff)} + ${money(monthlyShare)}`
                : undefined,
          },
        ]}
      />
    </section>
  );
}
