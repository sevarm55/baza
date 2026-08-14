import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

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
      className="grid gap-[var(--seam)] sm:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
      aria-label={hy.owner.payrollDue}
    >
      <div className="pay-hero">
        <span className="pay-hero-label">{hy.owner.toPay}</span>
        <span className="pay-hero-value">{money(outstanding)}</span>
        <span className="pay-hero-note">
          {outstanding > 0
            ? `${owedTo} ${staffRole.toLocaleLowerCase('hy')}`
            : hy.payroll.dayAllPaid}
        </span>
      </div>

      <div className="pay-metrics">
        <div className="pay-metric">
          <div className="pay-metric-value">{money(accrued)}</div>
          <div className="pay-metric-label">{hy.owner.payrollAccrued}</div>
        </div>
        <div className="pay-metric">
          <div className="pay-metric-value">{money(settled)}</div>
          <div className="pay-metric-label">{hy.payroll.paid}</div>
        </div>
        <div className="pay-metric">
          <div className="pay-metric-value">{units}</div>
          <div className="pay-metric-label">{unitOne}</div>
        </div>
      </div>
    </section>
  );
}
