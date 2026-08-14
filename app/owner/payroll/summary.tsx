import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Figures, Plate } from '@/components/board';

/**
 * Показания наверху страницы.
 *
 * Четыре одинаковые карточки здесь были бы неправдой: три из четырёх
 * чисел на этой странице — справка, и только одно требует действия.
 * Поэтому «к выплате» стоит плитой, а начислено, выплачено и машины —
 * полосой втрое тише. Иерархия задана размером и заливкой, а не
 * подписями: какое число главное, видно раньше, чем прочитано слово.
 *
 * Пятого цвета здесь нет и быть не может: плита тёмная, полоса
 * нейтральная. Раскрашивать справочные числа значит превращать верх
 * страницы в светофор, по которому нечего читать.
 *
 * Сами приборы живут в `components/board.tsx`: той же парой начинается
 * сводка дня, и две похожие, но разные шапки внутри одного продукта
 * читались бы как разный расчёт.
 */
export function PayrollSummary({
  currency,
  outstanding,
  owedTo,
  accrued,
  settled,
  units,
  unitOne,
  staffRole,
}: {
  currency: string;
  /** сколько сейчас нужно раздать */
  outstanding: number;
  /** скольким людям */
  owedTo: number;
  accrued: number;
  settled: number;
  units: number;
  unitOne: string;
  staffRole: string;
}) {
  const money = (n: number) => formatMoney(n, currency);

  return (
    <section
      /* Порог тот же, что у сводки дня: до 1024 плита и полоса идут
         друг под другом, иначе числа и подписи в них обрезаются. */
      className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={hy.owner.payrollDue}
    >
      <Plate
        label={hy.owner.toPay}
        value={money(outstanding)}
        note={
          outstanding > 0
            ? `${owedTo} ${staffRole.toLocaleLowerCase('hy')}`
            : hy.payroll.dayAllPaid
        }
      />

      <Figures
        items={[
          { label: hy.owner.payrollAccrued, value: money(accrued) },
          { label: hy.payroll.paid, value: money(settled) },
          { label: unitOne, value: String(units) },
        ]}
      />
    </section>
  );
}
