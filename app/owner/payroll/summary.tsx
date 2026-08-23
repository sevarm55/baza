import { formatMoney } from '@/lib/money';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { getDict } from '@/lib/i18n/server';
import { staffCount, unitWord } from '@/lib/i18n/terms';

/**
 * Показания наверху страницы.
 *
 * Четыре числа в одной полосе, но не четыре равных: три из них справка,
 * и только одно требует действия. Поэтому «к выплате» стоит крупнее и
 * окрашено, пока долг есть, а начислено, выплачено и машины идут тише.
 * Какое число главное, видно раньше, чем прочитано слово.
 */
export async function PayrollSummary({
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
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <section aria-label={t.owner.payrollDue}>
      <MetricStrip columns={4}>
        <Metric
          label={t.owner.toPay}
          value={money(outstanding)}
          size="lg"
          tone={outstanding > 0 ? 'warning' : 'default'}
          hint={outstanding > 0 ? staffCount(owedTo, staffRole, t.locale) : t.payroll.dayAllPaid}
        />
        <Metric label={t.owner.payrollAccrued} value={money(accrued)} />
        <Metric label={t.payroll.paid} value={money(settled)} />
        <Metric label={unitWord(units, unitOne, t.locale)} value={String(units)} />
      </MetricStrip>
    </section>
  );
}
