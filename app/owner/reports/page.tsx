import Link from 'next/link';
import { redirect } from 'next/navigation';

import { requireOwner } from '@/lib/auth';
import { listPoints } from '@/lib/accounts';
import { getTenant, getUser } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { passesEnabled } from '@/lib/features';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm, unitForms } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import { asRangeKey, rangeFor, type ReportRange } from '@/lib/report-range';
import {
  getCostsByCategory,
  getEarnedByService,
  getHeatmap,
  getPaymentMix,
  getRangeSeries,
  getRangeSummary,
  getStaffPerformance,
  mergeSeries,
  mergeSummaries,
  type HeatCell,
  type SeriesPoint,
} from '@/lib/reports';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/patterns/page-header';
import { PanelGrid } from '@/components/patterns/panel';
import { Delta, Metric, MetricStrip } from '@/components/patterns/metric';
import { EmptyState } from '@/components/patterns/states';
import { ErrorState } from '@/components/patterns/error-state';
import { ReportToolbar } from './report/toolbar';
import { TrendChart } from './report/trend-chart';
import { CarsChart } from './report/cars-chart';
import { AvgCheckChart } from './report/avg-check-chart';
import { Heatmap } from './report/heatmap';
import { PaymentDonut } from './report/payment-donut';
import { CostsTable, ServicesTable } from './report/breakdown-table';
import { TeamTable } from './report/team-table';
import { BranchCompare } from './report/branch-compare';
import {
  reportHref,
  SCOPES,
  TABS,
  type BranchRow,
  type BranchSeries,
  type CostRow,
  type HeatRow,
  type PaymentRow,
  type Point,
  type ReportQuery,
  type ReportTab,
  type Scope,
  type ServiceRow,
  type TeamRow,
} from './model';

/* Цвета способов оплаты: те же, что на сводке. */
const PAYMENT_COLORS: Record<string, string> = {
  cash: 'var(--success)',
  card: 'var(--chart-1)',
  transfer: 'var(--chart-3)',
  pass: 'var(--warning)',
};

const BRANCH_COLORS = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-2)', 'var(--chart-4)', 'var(--warning)', 'var(--success)'];

/**
 * Отчёт: аналитика владельца за любой отрезок.
 *
 * Страница отвечает на вопросы в порядке их важности: сколько заработал
 * и лучше ли стало (показания с дельтой), как шло по дням (динамика),
 * где деньги (услуги, оплата, расходы), когда приезжают (загрузка), кто
 * это сделал (команда). Вкладки делят вопросы по темам, чтобы один
 * экран не отвечал на всё сразу.
 *
 * Каждый блок считается своим запросом и падает отдельно: упавший
 * показывает «не загрузился», остальные живут. Числа те же, что на
 * сводке, потому что считаются теми же функциями.
 */
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');
  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');

  const sp = await searchParams;
  const tab: ReportTab = (TABS as readonly string[]).includes(sp.tab ?? '') ? (sp.tab as ReportTab) : 'overview';
  const rangeKey = asRangeKey(sp.r);
  const range = rangeFor(rangeKey, tenant.timezone, { from: sp.from, to: sp.to });
  const compare = sp.cmp !== '0';

  /* Филиалы: только те, где этот человек владелец и куда пускают. Чужие
     точки и точки без оплаты сюда не попадают. */
  const points = me.accountId ? await listPoints(me.accountId) : [];
  const owned = points.filter((p) => p.role === 'owner' && p.canRead);
  const multi = owned.length > 1;
  const scopeRaw = (SCOPES as readonly string[]).includes(sp.scope ?? '') ? (sp.scope as Scope) : 'current';
  const scope: Scope = multi ? scopeRaw : 'current';
  const tenantIds = scope === 'current' ? [tenant.id] : owned.map((p) => p.id);

  const query: ReportQuery = {
    r: range.key,
    from: range.key === 'custom' ? range.fromDay : null,
    to: range.key === 'custom' ? range.toDay : null,
    tab,
    scope,
    compare,
  };
  const now = new Date();
  const exportDays = Math.max(1, Math.ceil((now.getTime() - range.from.getTime()) / 86_400_000));
  const exportHref = `/owner/export?days=${exportDays}`;

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const units = unitForms(tenant.unitOne, t.locale);

  /* Каждый блок отдельно и с правом упасть. */
  const settled = async <T,>(p: Promise<T>): Promise<T | null> => p.catch(() => null);
  const perTenant = <T,>(fn: (id: string) => Promise<T>) => Promise.all(tenantIds.map(fn));

  const [summaries, prevSummaries, seriesLists, prevSeriesLists] = await Promise.all([
    settled(perTenant((id) => getRangeSummary(id, range.from, range.to, range.spread))),
    settled(perTenant((id) => getRangeSummary(id, range.prevFrom, range.prevTo, range.spread))),
    settled(perTenant((id) => getRangeSeries(id, range, tenant.timezone))),
    settled(
      perTenant((id) =>
        getRangeSeries(
          id,
          { from: range.prevFrom, to: range.prevTo, byHour: range.byHour, spread: range.spread, days: range.days },
          tenant.timezone,
        ),
      ),
    ),
  ]);

  const summary = summaries ? mergeSummaries(summaries) : null;
  const prev = prevSummaries ? mergeSummaries(prevSummaries) : null;
  const hasPrev = !!prev && prev.count > 0;

  /* Пустой бизнес: ещё ни одной машины за всё время. Не ошибка
     аналитики, а ещё не наступившая. */
  if (summary && summary.count === 0 && scope === 'current' && (!prev || prev.count === 0) && range.key === 'month') {
    const everything = await settled(getRangeSummary(tenant.id, tenant.createdAt, new Date(), 30));
    if (everything && everything.count === 0) {
      return (
        <div className="flex flex-col gap-5">
          <PageHeader className="mb-0" title={t.reports.title} description={t.reports.lead} />
          <EmptyState
            title={t.reports.emptyAll}
            description={t.reports.emptyAllNote}
            action={<Button render={<Link href="/work" />}>{t.reports.emptyAllCta}</Button>}
          />
        </div>
      );
    }
  }

  const labelOf = pointLabeller(range, tenant.timezone, t);
  const series = seriesLists ? mergeSeries(seriesLists) : null;
  const prevSeries = prevSeriesLists ? mergeSeries(prevSeriesLists) : [];
  const pointsRow: Point[] | null = series
    ? padPoints(series, prevSeries, range, tenant.timezone, labelOf)
    : null;

  const branchSeries: BranchSeries[] | undefined =
    scope === 'compare' && seriesLists
      ? owned.map((p, i) => ({
          id: p.id,
          name: p.name,
          color: BRANCH_COLORS[i % BRANCH_COLORS.length],
          points: (seriesLists[i] ?? []).map((x) => ({ key: x.key, revenue: x.revenue })),
        }))
      : undefined;

  const branchRows: BranchRow[] | null =
    scope === 'compare' && summaries
      ? owned.map((p, i) => {
          const s = summaries[i];
          return {
            id: p.id,
            name: p.name,
            current: p.id === tenant.id,
            revenue: s.revenue,
            profit: s.profit,
            count: s.count,
            avgCheck: s.avgCheck,
            payroll: s.payroll,
            costs: s.costs,
          };
        })
      : null;

  /* Разрезы по вкладке: лишнего не считаем. */
  const wantServices = tab === 'overview' || tab === 'finance' || tab === 'operations';
  const wantCosts = tab === 'overview' || tab === 'finance';
  const wantPayments = tab === 'overview' || tab === 'finance';
  const wantHeat = tab === 'operations';
  const wantTeam = tab === 'overview' || tab === 'team';

  const [services, costs, prevCosts, payments, heat, team] = await Promise.all([
    wantServices ? settled(perTenant((id) => getEarnedByService(id, range.from, range.to))) : null,
    wantCosts ? settled(perTenant((id) => getCostsByCategory(id, range.from, range.to, range.spread))) : null,
    wantCosts && compare
      ? settled(perTenant((id) => getCostsByCategory(id, range.prevFrom, range.prevTo, range.spread)))
      : null,
    wantPayments ? settled(perTenant((id) => getPaymentMix(id, range.from, range.to))) : null,
    wantHeat ? settled(perTenant((id) => getHeatmap(id, range.from, range.to, tenant.timezone))) : null,
    wantTeam ? settled(perTenant((id) => getStaffPerformance(id, range.from, range.to))) : null,
  ]);

  const serviceRows: ServiceRow[] | null = services
    ? (() => {
        const by = new Map<string, { count: number; revenue: number }>();
        for (const list of services)
          for (const s of list) {
            const cur = by.get(s.name) ?? { count: 0, revenue: 0 };
            by.set(s.name, { count: cur.count + s.count, revenue: cur.revenue + s.revenue });
          }
        const total = [...by.values()].reduce((s, x) => s + x.revenue, 0);
        return [...by.entries()]
          .map(([name, x]) => ({
            key: name,
            name: serviceNameTerm(name, t.locale),
            count: x.count,
            revenue: x.revenue,
            avg: x.count > 0 ? Math.round(x.revenue / x.count) : 0,
            share: total > 0 ? Math.round((x.revenue / total) * 1000) / 10 : 0,
          }))
          .sort((a, b) => b.revenue - a.revenue);
      })()
    : null;

  const costRows: CostRow[] | null = costs
    ? (() => {
        const by = new Map<string, { monthly: boolean; amount: number }>();
        for (const list of costs)
          for (const c of list) {
            const key = `${c.category}|${c.monthly}`;
            const cur = by.get(key) ?? { monthly: c.monthly, amount: 0 };
            by.set(key, { monthly: c.monthly, amount: cur.amount + c.amount });
          }
        const prevBy = new Map<string, number>();
        for (const list of prevCosts ?? [])
          for (const c of list) {
            const key = `${c.category}|${c.monthly}`;
            prevBy.set(key, (prevBy.get(key) ?? 0) + c.amount);
          }
        const total = [...by.values()].reduce((s, x) => s + x.amount, 0);
        return [...by.entries()]
          .map(([key, x]) => ({
            key,
            name: key.split('|')[0],
            monthly: x.monthly,
            amount: x.amount,
            share: total > 0 ? Math.round((x.amount / total) * 1000) / 10 : 0,
            prev: prevCosts ? (prevBy.get(key) ?? null) : null,
          }))
          .sort((a, b) => b.amount - a.amount);
      })()
    : null;

  const paymentRows: PaymentRow[] | null = payments
    ? (() => {
        const by = new Map<string, { revenue: number; count: number }>();
        for (const list of payments)
          for (const p of list) {
            if (!passesEnabled() && p.payment === 'pass') continue;
            const cur = by.get(p.payment) ?? { revenue: 0, count: 0 };
            by.set(p.payment, { revenue: cur.revenue + p.revenue, count: cur.count + p.count });
          }
        const total = [...by.values()].reduce((s, x) => s + x.revenue, 0);
        return [...by.entries()]
          .filter(([, x]) => x.revenue > 0)
          .map(([key, x]) => ({
            key,
            label: paymentLabel(key, t),
            revenue: x.revenue,
            count: x.count,
            share: total > 0 ? Math.round((x.revenue / total) * 1000) / 10 : 0,
            color: PAYMENT_COLORS[key] ?? 'var(--chart-4)',
          }))
          .sort((a, b) => b.revenue - a.revenue);
      })()
    : null;

  const heatRows: HeatRow[] | null = heat
    ? (() => {
        const by = new Map<string, HeatCell>();
        for (const list of heat)
          for (const c of list) {
            const key = `${c.dow}-${c.hour}`;
            const cur = by.get(key);
            if (cur) {
              cur.count += c.count;
              cur.revenue += c.revenue;
            } else by.set(key, { ...c });
          }
        return [...by.values()];
      })()
    : null;

  const teamRows: TeamRow[] | null = team
    ? (() => {
        const flat = team.flat();
        const total = flat.reduce((s, x) => s + x.earned, 0);
        return flat
          .filter((x) => x.count > 0)
          .sort((a, b) => b.earned - a.earned)
          .map((x) => ({
            key: `${x.staffId ?? 'noname'}-${x.name}`,
            name: x.name ?? '·',
            count: x.count,
            revenue: x.revenue,
            earned: x.earned,
            avgCheck: x.avgCheck,
            shifts: x.shifts,
            hours: x.hours,
            percent: x.percent,
            share: total > 0 ? Math.round((x.earned / total) * 1000) / 10 : 0,
          }));
      })()
    : null;

  const weekdays = weekdayNames(t.locale);
  const periodLabel = rangeLabel(range, tenant.timezone, t);

  /* Показания: шесть чисел, каждое с дельтой к базе, где база есть. */
  const delta = (now: number, was: number | undefined, good: 'up' | 'down' = 'up') =>
    hasPrev && was !== undefined ? (
      <Delta
        value={now - was}
        formatted={was > 0 ? `${Math.abs(Math.round(((now - was) / was) * 1000) / 10)}%` : undefined}
        good={good}
      />
    ) : undefined;

  /* Показание ведёт на вкладку, которая его разбирает: выручка и
     прибыль в финансы, машины и средний чек в работу, зарплата в
     команду, расходы в сам список трат. На своей вкладке показание
     ссылкой не становится: нажатие, которое никуда не ведёт, хуже
     отсутствия нажатия. */
  const toTab = (target: ReportTab) =>
    tab === target ? undefined : reportHref('/owner/reports', { ...query, tab: target });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.reports.title} description={t.reports.lead} meta={
          <span className="num">
            <span className="hidden sm:inline" aria-hidden>
              ·{' '}
            </span>
            {periodLabel}
          </span>
        }>
        <ReportToolbar query={query} multi={multi} exportHref={exportHref} />
      </PageHeader>

      {summary ? (
        <MetricStrip columns={6}>
          <Metric
            size="md"
            href={toTab('finance')}
            label={t.reports.kpi.revenue}
            value={money(summary.revenue)}
            delta={compare ? delta(summary.revenue, prev?.revenue) : undefined}
            hint={summary.discounts > 0 ? `${t.reports.discounts} ${money(summary.discounts)}` : undefined}
          />
          <Metric
            size="md"
            href={toTab('finance')}
            label={t.reports.kpi.net}
            value={money(summary.profit)}
            tone={summary.profit < 0 ? 'destructive' : 'default'}
            delta={compare ? delta(summary.profit, prev?.profit) : undefined}
            hint={summary.revenue > 0 ? `${summary.kept}% ${t.owner.kept}` : undefined}
          />
          <Metric
            size="md"
            href={toTab('operations')}
            label={units.many}
            value={String(summary.count)}
            delta={compare ? delta(summary.count, prev?.count) : undefined}
            hint={range.days > 1 ? t.reports.kpi.perDay(String(Math.round((summary.count / range.days) * 10) / 10)) : undefined}
          />
          <Metric
            size="md"
            href={toTab('operations')}
            label={t.reports.kpi.avgCheck}
            value={money(summary.avgCheck)}
            delta={compare ? delta(summary.avgCheck, prev?.avgCheck) : undefined}
          />
          <Metric
            size="md"
            href={toTab('team')}
            label={t.reports.kpi.payroll}
            value={money(summary.payroll)}
            delta={compare ? delta(summary.payroll, prev?.payroll, 'down') : undefined}
            hint={summary.revenue > 0 ? `${summary.payrollShare}% ${t.reports.kpi.ofRevenue}` : undefined}
          />
          <Metric
            size="md"
            href={range.key === 'prevmonth' ? '/owner/expenses?m=prev' : '/owner/expenses'}
            label={t.reports.kpi.costs}
            value={money(summary.costs)}
            delta={compare ? delta(summary.costs, prev?.costs, 'down') : undefined}
            hint={summary.revenue > 0 ? `${summary.costsShare}% ${t.reports.kpi.ofRevenue}` : undefined}
          />
        </MetricStrip>
      ) : (
        <ErrorState title={t.reports.charts.failed} />
      )}

      {branchRows && <BranchCompare rows={branchRows} currency={tenant.currency} unitLabel={units.many} />}

      <PanelGrid>
        {tab === 'overview' && (
          <>
            <TrendBlock points={pointsRow} currency={tenant.currency} unitOne={tenant.unitOne} byHour={range.byHour} compare={compare && hasPrev} branches={branchSeries} className="lg:col-span-8" t={t} />
            {paymentRows ? (
              <PaymentDonut className="lg:col-span-4" rows={paymentRows} currency={tenant.currency} unitOne={tenant.unitOne} />
            ) : (
              <Failed className="lg:col-span-4" title={t.reports.charts.payments} t={t} />
            )}
            {pointsRow ? (
              <>
                <CarsChart className="lg:col-span-6" points={pointsRow} unitOne={tenant.unitOne} compare={compare && hasPrev} />
                <AvgCheckChart className="lg:col-span-6" points={pointsRow} avg={summary?.avgCheck ?? 0} currency={tenant.currency} compare={compare && hasPrev} />
              </>
            ) : (
              <>
                <Failed className="lg:col-span-6" title={t.reports.charts.cars} t={t} />
                <Failed className="lg:col-span-6" title={t.reports.charts.avgCheck} t={t} />
              </>
            )}
            {serviceRows ? (
              <ServicesTable className="lg:col-span-6" rows={serviceRows} currency={tenant.currency} compact />
            ) : (
              <Failed className="lg:col-span-6" title={t.reports.charts.services} t={t} />
            )}
            {teamRows ? (
              <TeamTable className="lg:col-span-6" rows={teamRows} currency={tenant.currency} unitLabel={units.many} compact />
            ) : (
              <Failed className="lg:col-span-6" title={t.reports.charts.team} t={t} />
            )}
          </>
        )}

        {tab === 'finance' && (
          <>
            <TrendBlock points={pointsRow} currency={tenant.currency} unitOne={tenant.unitOne} byHour={range.byHour} compare={compare && hasPrev} branches={branchSeries} className="lg:col-span-12" height="h-80" t={t} />
            {costRows ? (
              <CostsTable className="lg:col-span-7" rows={costRows} currency={tenant.currency} compare={compare && hasPrev} />
            ) : (
              <Failed className="lg:col-span-7" title={t.reports.charts.costs} t={t} />
            )}
            {paymentRows ? (
              <PaymentDonut className="lg:col-span-5" rows={paymentRows} currency={tenant.currency} unitOne={tenant.unitOne} />
            ) : (
              <Failed className="lg:col-span-5" title={t.reports.charts.payments} t={t} />
            )}
            {serviceRows ? (
              <ServicesTable className="lg:col-span-12" rows={serviceRows} currency={tenant.currency} />
            ) : (
              <Failed className="lg:col-span-12" title={t.reports.charts.services} t={t} />
            )}
          </>
        )}

        {tab === 'operations' && (
          <>
            {heatRows ? (
              <Heatmap className="lg:col-span-8" rows={heatRows} weekdays={weekdays} currency={tenant.currency} unitOne={tenant.unitOne} />
            ) : (
              <Failed className="lg:col-span-8" title={t.reports.charts.heatmap} t={t} />
            )}
            {pointsRow ? (
              <CarsChart className="lg:col-span-4" points={pointsRow} unitOne={tenant.unitOne} compare={compare && hasPrev} height="h-64" />
            ) : (
              <Failed className="lg:col-span-4" title={t.reports.charts.cars} t={t} />
            )}
            {pointsRow ? (
              <AvgCheckChart className="lg:col-span-5" points={pointsRow} avg={summary?.avgCheck ?? 0} currency={tenant.currency} compare={compare && hasPrev} />
            ) : (
              <Failed className="lg:col-span-5" title={t.reports.charts.avgCheck} t={t} />
            )}
            {serviceRows ? (
              <ServicesTable className="lg:col-span-7" rows={serviceRows} currency={tenant.currency} />
            ) : (
              <Failed className="lg:col-span-7" title={t.reports.charts.services} t={t} />
            )}
          </>
        )}

        {tab === 'team' && (
          <>
            {teamRows ? (
              <TeamTable className="lg:col-span-12" rows={teamRows} currency={tenant.currency} unitLabel={units.many} />
            ) : (
              <Failed className="lg:col-span-12" title={t.reports.charts.team} t={t} />
            )}
            <TrendBlock points={pointsRow} currency={tenant.currency} unitOne={tenant.unitOne} byHour={range.byHour} compare={compare && hasPrev} branches={branchSeries} className="lg:col-span-12" t={t} />
          </>
        )}
      </PanelGrid>
    </div>
  );
}

/* ------------------------------ helpers ------------------------------ */

function TrendBlock({
  points,
  t,
  className,
  ...rest
}: {
  points: Point[] | null;
  currency: string;
  unitOne: string;
  byHour: boolean;
  compare: boolean;
  branches?: BranchSeries[];
  className?: string;
  height?: string;
  t: Dict;
}) {
  if (!points) return <Failed className={className} title={t.reports.charts.dynamics} t={t} />;
  return <TrendChart className={className} points={points} {...rest} />;
}

function Failed({ title, t, className }: { title: string; t: Dict; className?: string }) {
  return (
    <div className={className}>
      <ErrorState title={title} description={t.reports.charts.failed} />
    </div>
  );
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

/** Подписи дней недели с понедельника, коротко и на языке смотрящего. */
function weekdayNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
  // 2024-01-01 понедельник
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(2024, 0, 1 + i))));
}

/** «1 — 23 августа» или «23 августа». */
function rangeLabel(range: ReportRange, timezone: string, t: Dict): string {
  const f = new Intl.DateTimeFormat(intlLocale(t.locale), { day: 'numeric', month: 'long', timeZone: timezone });
  const last = new Date(range.to.getTime() - 1);
  if (range.days === 1) return f.format(range.from);
  const day = new Intl.DateTimeFormat(intlLocale(t.locale), { day: 'numeric', timeZone: timezone });
  const month = (d: Date) => new Intl.DateTimeFormat('en', { month: 'numeric', year: 'numeric', timeZone: timezone }).format(d);
  return month(range.from) === month(last)
    ? `${day.format(range.from)} — ${f.format(last)}`
    : `${f.format(range.from)} — ${f.format(last)}`;
}

/** Как подписывать точку: «09:00» для часов, «23» или «23.08» для дней. */
function pointLabeller(range: ReportRange, timezone: string, t: Dict): (key: string) => string {
  if (range.byHour) return (key) => `${key.slice(11, 13)}:00`;
  const multiMonth =
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(range.from) !==
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(new Date(range.to.getTime() - 1));
  void t;
  return (key) => (multiMonth ? `${key.slice(8, 10)}.${key.slice(5, 7)}` : key.slice(8, 10));
}

/**
 * Ряд с пустыми точками: день без машин это столбик-ноль, а не дыра.
 * Предыдущий отрезок подставляется по смещению: тот же час или тот же
 * по счёту день, чтобы понедельник сравнивался с понедельником.
 */
function padPoints(
  series: SeriesPoint[],
  prevSeries: SeriesPoint[],
  range: ReportRange,
  timezone: string,
  label: (key: string) => string,
): Point[] {
  const by = new Map(series.map((s) => [s.key, s]));
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' });
  const keys: string[] = [];

  if (range.byHour) {
    const day = ymd.format(range.from);
    const hours = series.map((s) => Number(s.key.slice(11, 13)));
    const isToday = range.to.getTime() > Date.now();
    const nowHour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()),
    );
    const start = Math.min(8, ...(hours.length ? hours : [8]));
    const end = isToday ? Math.max(nowHour, start + 1, ...(hours.length ? hours : [])) : Math.max(20, ...(hours.length ? hours : [20]));
    for (let h = start; h <= end; h++) keys.push(`${day} ${String(h).padStart(2, '0')}`);
  } else {
    for (let i = 0; i < range.days; i++) keys.push(`${ymd.format(new Date(range.from.getTime() + i * 86_400_000))} 00`);
  }

  /* Предыдущий ряд по смещению от его начала. */
  const prevKeys: string[] = range.byHour
    ? keys.map((k) => `${ymd.format(range.prevFrom)} ${k.slice(11, 13)}`)
    : keys.map((_, i) => `${ymd.format(new Date(range.prevFrom.getTime() + i * 86_400_000))} 00`);
  const prevBy = new Map(prevSeries.map((s) => [s.key, s]));

  return keys.map((key, i) => {
    const s = by.get(key);
    const p = prevBy.get(prevKeys[i]);
    const withinPrev = range.byHour
      ? true
      : range.prevFrom.getTime() + i * 86_400_000 < range.prevTo.getTime();
    return {
      key,
      label: label(key),
      revenue: s?.revenue ?? 0,
      count: s?.count ?? 0,
      paidCount: s?.paidCount ?? 0,
      payroll: s?.payroll ?? 0,
      costs: s?.costs ?? 0,
      net: s?.net ?? 0,
      avgCheck: s?.avgCheck ?? 0,
      prevRevenue: withinPrev ? (p?.revenue ?? 0) : null,
      prevCount: withinPrev ? (p?.count ?? 0) : null,
      prevAvgCheck: withinPrev ? (p?.avgCheck ?? 0) : null,
    };
  });
}
