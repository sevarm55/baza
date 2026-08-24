import { formatMoney } from '@/lib/money';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { DesktopOnly, MobileOnly } from '@/components/mobile';
import { getDict } from '@/lib/i18n/server';
import { staffCount, unitWord } from '@/lib/i18n/terms';
import { PayrollHeroMobile } from './mobile';

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
  people,
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
  /** кому должны, от большего долга к меньшему: стопка лиц на телефоне */
  people: { name: string; owed: number }[];
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  return (
    <section aria-label={t.owner.payrollDue}>
      {/* На телефоне экран начинается с людей, а не с прибора: сводка
          отвечает «сколько получилось», зарплаты — «кому раздать». */}
      <MobileOnly>
        <PayrollHeroMobile
          outstanding={outstanding}
          owedTo={owedTo}
          accrued={accrued}
          settled={settled}
          units={units}
          currency={currency}
          unitOne={unitOne}
          staffRole={staffRole}
          people={people}
        />
      </MobileOnly>

      <DesktopOnly>
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
      </DesktopOnly>
    </section>
  );
}
