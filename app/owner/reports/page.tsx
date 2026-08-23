import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPaymentSplit, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { passesEnabled } from '@/lib/features';
import { daysInMonthOf } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm, staffCount, unitCount } from '@/lib/i18n/terms';
import { monthName as monthNameFmt, shortMonth as shortMonthFmt } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import {
  getCostsByCategory,
  getEarnedByService,
  getMonthBase,
  getMonthlyReport,
  type ReportMonth,
} from '@/lib/reports';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/page-header';
import { PanelGrid } from '@/components/patterns/panel';
import { Delta, Metric, MetricStrip } from '@/components/patterns/metric';
import { Segmented } from '@/components/patterns/segmented';
import { EmptyState } from '@/components/patterns/states';
import { Bars, type BarRow } from './bars';
import { MonthsTable, type MonthRow } from './months';
import { ProfitSplit } from './split';
import { ReportTeam, type TeamMember } from './team';
import { Trend } from './trend';
import type { TrendPoint } from './model';

/**
 * Сколько месяцев показываем.
 *
 * Плюс один сверх показанных: самому старому месяцу в таблице тоже
 * нужна база сравнения, а взять её неоткуда, кроме как из месяца перед
 * ним. Лишний он только на экране, считается так же, как остальные.
 */
const MONTHS = 6;

/**
 * Отчёт.
 *
 * Вопрос, который владелец задаёт себе на самом деле: сколько я
 * заработал, стало лучше или хуже, и почему. Порядок чтения задан
 * вопросами, а не удобством вёрстки:
 *
 *   1. сколько заработал за месяц   → первое показание полосы;
 *   2. из чего это сложилось        → три показания рядом;
 *   3. лучше или хуже стало         → сравнение и график месяцев;
 *   4. какая доля куда ушла         → пропорция;
 *   5. откуда пришли деньги         → услуги;
 *   6. куда ушли                    → расходы по названиям;
 *   7. чем платили                  → способы оплаты;
 *   8. кто это сделал               → люди;
 *   9. точные числа                 → таблица месяцев.
 *
 * Ни одно число здесь не считается по-своему: месяцы идут через те же
 * функции, что сводка и расходы. Отчёт, расходящийся с кабинетом хотя бы
 * на драм, не читают вовсе.
 */
export default async function ReportsPage({
  searchParams,
}: {
  /** какой месяц открыт: 0 текущий, 1 прошлый и так далее */
  searchParams: Promise<{ m?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит только на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const requested = await getMonthlyReport(tenant.id, tenant.timezone, MONTHS);

  /* Месяцы до первой работы отрезаются.
   *
   * Бизнесу может быть два месяца, а окно отчёта шесть, и четыре из них
   * рисовались бы нулями. Это не нули бизнеса, это месяцы, когда бизнеса
   * ещё не было. Пустой месяц посреди ряда остаётся на месте: он значит
   * «стояли», и это ответ, за которым в отчёт и приходят. Отрезается
   * только хвост с дальнего конца, и только до первого месяца, в котором
   * хоть что-то было. Один месяц остаётся всегда. */
  const idle = (m: ReportMonth) => m.count === 0 && m.revenue === 0 && m.costs === 0;
  let oldest = requested.length - 1;
  while (oldest > 0 && idle(requested[oldest])) oldest--;
  const months = requested.slice(0, oldest + 1);

  /* Мойка, которая ещё не работала ни дня: здесь пусто по одной
     причине, и её можно назвать. Отсюда же и единственное действие,
     записать первую машину. Возврат стоит до тяжёлых запросов месяца. */
  if (months.length === 1 && idle(months[0])) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader className="mb-0" title={t.reports.title} description={t.reports.note} />
        <EmptyState
          title={t.reports.emptyAll}
          description={t.reports.emptyAllNote}
          action={<Button render={<Link href="/work" />}>{t.reports.emptyAllCta}</Button>}
        />
      </div>
    );
  }

  const asked = Number((await searchParams).m ?? 0);
  const index = Number.isFinite(asked) && asked >= 0 && asked < months.length ? asked : 0;
  const current = months[index];

  const [costs, earned, split, base] = await Promise.all([
    getCostsByCategory(
      tenant.id,
      current.from,
      current.to,
      daysInMonthOf(tenant.timezone, current.from),
    ),
    getEarnedByService(tenant.id, current.from, current.to),
    getPaymentSplit(tenant.id, current.from, current.to),
    getMonthBase(tenant.id, tenant.timezone, current),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const longMonth = monthNameFmt(t.locale, tenant.timezone);
  const shortMonth = shortMonthFmt(t.locale, tenant.timezone);

  const href = (i: number) => (i === 0 ? '/owner/reports' : `/owner/reports?m=${i}`);

  /* Переключатель месяцев и график читают слева направо, как время,
     поэтому месяцы переворачиваются: из базы они приходят от свежего к
     старому. */
  const monthItems = months
    .map((m, i) => ({ key: String(i), label: shortMonth.format(m.from), href: href(i) }))
    .reverse();

  const trend: TrendPoint[] = months
    .map((m, i) => ({
      key: m.from.toISOString(),
      label: shortMonth.format(m.from),
      href: href(i),
      current: i === index,
      revenue: m.revenue,
      profit: m.profit,
      count: m.count,
    }))
    .reverse();

  const monthRows: MonthRow[] = months.map((m, i) => ({
    key: m.from.toISOString(),
    name: longMonth.format(m.from),
    href: href(i),
    current: i === index,
    empty: idle(m),
    count: m.count,
    revenue: money(m.revenue),
    payroll: money(m.payroll),
    costs: money(m.costs),
    profit: money(m.profit),
    loss: m.profit < 0,
    kept: m.kept,
  }));

  const services: BarRow[] = earned.map((e) => ({
    key: e.name,
    name: serviceNameTerm(e.name, t.locale),
    note: `${e.count} ${t.owner.timesShort}`,
    value: e.revenue,
    money: money(e.revenue),
  }));
  const servicesTotal = services.reduce((sum, r) => sum + r.value, 0);

  const costRows: BarRow[] = costs.map((c) => ({
    key: `${c.category}-${c.monthly}`,
    name: c.category,
    note: c.monthly ? t.expenses.perMonth : t.expenses.oneOff,
    value: c.amount,
    money: money(c.amount),
  }));

  /* Способы оплаты только те, что встретились: строка «0 ֏ · 0 %»
     сообщает ровно то же, что её отсутствие, и занимает место. */
  const paid = split.filter((x) => (passesEnabled() || x.payment !== 'pass') && x.revenue > 0);
  const paidTotal = paid.reduce((sum, x) => sum + x.revenue, 0);
  const payments: BarRow[] = [...paid]
    .sort((a, b) => b.revenue - a.revenue)
    .map((x) => ({
      key: x.payment,
      name: paymentLabel(x.payment, t),
      note: unitCount(x.count, tenant.unitOne, t.locale),
      value: x.revenue,
      money: money(x.revenue),
    }));

  const team: TeamMember[] = [...current.byStaff]
    .filter((s) => s.count > 0)
    .sort((a, b) => b.earned - a.earned)
    .map((s) => ({
      key: s.staffId ?? `noname-${s.name}`,
      name: s.name ?? '·',
      count: s.count,
      earned: money(s.earned),
    }));

  /* Сравнение считается по прибыли: первое показание показывает её, и
     подпись рядом обязана объяснять именно то число, которое стоит над
     ней. Процент только когда в базе была прибыль: от нуля и от убытка
     процент не считается, «+100 %» к нулю сообщает не о росте, а о том,
     что раньше сравнивать было не с чем. */
  const delta = base ? current.profit - base.profit : null;
  const growth =
    base && base.profit > 0 && delta !== null ? Math.round((delta / base.profit) * 100) : null;
  const loss = current.profit < 0;

  /* Скидки стоят рядом с выручкой, а не в расходах: это не расход, а
     деньги, которых бизнес решил не брать, и в вычитание им нельзя, там
     они посчитались бы дважды. Называются только когда были. */
  const revenueHint = [
    unitCount(current.count, tenant.unitOne, t.locale),
    current.avgCheck > 0 ? `${t.owner.avgCheck} ${money(current.avgCheck)}` : null,
    current.discounts > 0 ? `${t.reports.discounts} ${money(current.discounts)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const costsHint = [
    current.oneOff > 0 ? `${t.expenses.oneOffs} ${money(current.oneOff)}` : null,
    current.monthlyShare > 0 ? `${t.expenses.monthlyAccrued} ${money(current.monthlyShare)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.reports.title} description={t.reports.note}>
        {/* Месяц живёт в адресе: ссылку на разбор можно послать себе же.
            Открытый месяц подсвечен ещё и в графике, и в таблице. */}
        <Segmented label={t.reports.month} current={String(index)} items={monthItems} />
      </PageHeader>

      <MetricStrip columns={4}>
        <Metric
          size="lg"
          label={t.owner.profit}
          value={money(Math.abs(current.profit))}
          tone={loss ? 'destructive' : 'default'}
          delta={
            <Delta
              value={delta}
              formatted={
                delta === null
                  ? undefined
                  : growth !== null
                    ? `${Math.abs(growth)}%`
                    : money(Math.abs(delta))
              }
              noBase={t.owner.noBase}
            />
          }
          hint={
            loss
              ? t.owner.inTheRed
              : current.revenue > 0
                ? `${current.kept}% ${t.owner.kept}`
                : longMonth.format(current.from)
          }
        />
        <Metric label={t.owner.revenue} value={money(current.revenue)} hint={revenueHint} />
        <Metric
          label={t.owner.payrollAccrued}
          value={current.payroll > 0 ? `−${money(current.payroll)}` : money(0)}
          hint={team.length > 0 ? staffCount(team.length, tenant.staffRole, t.locale) : undefined}
        />
        <Metric
          label={t.owner.costs}
          value={current.costs > 0 ? `−${money(current.costs)}` : money(0)}
          hint={costsHint || undefined}
        />
      </MetricStrip>

      <PanelGrid>
        <Trend
          className="lg:col-span-8"
          points={trend}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
        />

        <ProfitSplit
          className="lg:col-span-4"
          currency={tenant.currency}
          revenue={current.revenue}
          payroll={current.payroll}
          costs={current.costs}
          profit={current.profit}
        />

        {/* Откуда пришло, куда ушло и чем платили: три разреза одного
            месяца, поэтому в один ряд и одинакового веса. */}
        <Bars
          className="lg:col-span-4"
          title={t.reports.whereFrom}
          rows={services}
          total={servicesTotal}
          empty={t.reports.emptyMonth}
        />
        <Bars
          className="lg:col-span-4"
          title={t.reports.whereGone}
          rows={costRows}
          total={current.costs}
          empty={t.expenses.empty}
        />
        <Bars
          className="lg:col-span-4"
          title={t.today.paidWith}
          rows={payments}
          total={paidTotal}
          empty={t.today.noPayments}
        />

        <ReportTeam
          className="lg:col-span-4"
          rows={team}
          unitOne={tenant.unitOne}
          title={t.settings.staff}
        />
        <MonthsTable className="lg:col-span-8" rows={monthRows} unitOne={tenant.unitOne} />
      </PanelGrid>
    </div>
  );
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
