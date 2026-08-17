import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPaymentSplit, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { passesEnabled } from '@/lib/features';
import { personColor } from '@/lib/person-color';
import { daysInMonthOf } from '@/lib/time';
import Link from 'next/link';
import { Panel } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';
import { localizeTenantOrNull } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import {
  getCostsByCategory,
  getEarnedByService,
  getMonthBase,
  getMonthlyReport,
  type ReportMonth,
} from '@/lib/reports';
import { Bars, type BarRow } from './bars';
import { MonthsTable, type MonthRow } from './months';
import { ProfitSplit } from './split';
import { ReportSummary } from './summary';
import { ReportTeam, type TeamMember } from './team';
import { Trend } from './trend';
import type { TrendPoint } from './model';

/**
 * Сколько месяцев показываем.
 *
 * Плюс один сверх показанных: самому старому месяцу в таблице тоже
 * нужна база сравнения, а взять её неоткуда, кроме как из месяца перед
 * ним. Лишний он только на экране — считается так же, как остальные.
 */
const MONTHS = 6;

/**
 * Отчёт.
 *
 * Кабинет отвечает «сколько сегодня» и «сколько в этом месяце». Вопрос,
 * который владелец задаёт себе на самом деле, другой: **сколько я
 * заработал, стало лучше или хуже, и почему**. Отвечать на него
 * таблицей из шести строк значит просить человека сделать работу,
 * которую продукт уже умеет делать сам.
 *
 * Порядок чтения задан вопросами, а не удобством вёрстки:
 *
 *   1. сколько заработал за месяц   → плита наверху;
 *   2. из чего это сложилось        → три слагаемых рядом с ней;
 *   3. лучше или хуже стало         → строка сравнения и график месяцев;
 *   4. какая доля куда ушла         → пропорция;
 *   5. откуда пришли деньги         → услуги;
 *   6. куда ушли                    → расходы по названиям;
 *   7. кто это сделал               → люди;
 *   8. точные числа                 → таблица месяцев.
 *
 * Ни одно число здесь не считается по-своему: месяцы идут через те же
 * функции, что сводка и расходы. Отчёт, расходящийся с кабинетом хотя бы
 * на драм, не читают вовсе.
 */
export default async function ReportsPage({
  searchParams,
}: {
  /** какой месяц открыт: 0 — текущий, 1 — прошлый и так далее */
  searchParams: Promise<{ m?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const requested = await getMonthlyReport(tenant.id, tenant.timezone, MONTHS);

  /* Месяцы до первой работы отрезаются.
   *
   * Бизнесу может быть два месяца, а окно отчёта — шесть, и четыре из
   * них рисовались нулями: четыре пустых столбца в графике и четыре
   * строки «не работали» в таблице. Это не нули бизнеса, это месяцы,
   * когда бизнеса ещё не было, и показывать их — то же самое, что
   * начинать историю мойки с года, когда её не построили.
   *
   * Пустой месяц ПОСРЕДИ ряда остаётся на месте: он значит «стояли», и
   * это ответ, за которым в отчёт и приходят. Отрезается только хвост с
   * дальнего конца, и только до первого месяца, в котором хоть что-то
   * было, — машина, приход или расход. Один месяц остаётся всегда,
   * иначе на новой мойке отчёт оказался бы пустым экраном.
   */
  const idle = (m: ReportMonth) => m.count === 0 && m.revenue === 0 && m.costs === 0;
  let oldest = requested.length - 1;
  while (oldest > 0 && idle(requested[oldest])) oldest--;
  const months = requested.slice(0, oldest + 1);

  /* Мойка, которая ещё не работала ни дня.
   *
   * Шесть месяцев нулей, пустой график и таблица из прочерков выглядят
   * не как «данных пока нет», а как сломанная аналитика — и человек
   * уходит, решив, что раздел не считает. Здесь пусто по одной причине,
   * и её можно назвать: работы ещё не было. Отсюда же и единственное
   * действие — записать первую машину.
   *
   * Возврат стоит до тяжёлых запросов месяца: считать разрезы по услугам
   * и расходам там, где нет ни одной записи, незачем. */
  if (months.length === 1 && idle(months[0])) {
    return (
      <>
        <PageHead title={t.reports.title} meta={t.reports.note} />
        <Panel>
          <EmptyState
            title={t.reports.emptyAll}
            note={t.reports.emptyAllNote}
            action={
              <Link className="btn btn-auto" href="/work">
                {t.reports.emptyAllCta}
              </Link>
            }
          />
        </Panel>
      </>
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
  const monthName = (m: ReportMonth) =>
    new Intl.DateTimeFormat(intlLocale(t.locale), { month: 'long', timeZone: tenant.timezone }).format(m.from);
  const shortMonth = new Intl.DateTimeFormat(intlLocale(t.locale), {
    month: 'short',
    timeZone: tenant.timezone,
  });

  const href = (i: number) => (i === 0 ? '/owner/reports' : `/owner/reports?m=${i}`);

  /* График читают слева направо, как время, поэтому месяцы
     переворачиваются: из базы они приходят от свежего к старому. */
  const trend: TrendPoint[] = [...months]
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
    name: monthName(m),
    href: href(i),
    current: i === index,
    empty: m.count === 0 && m.revenue === 0 && m.costs === 0,
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
    name: e.name,
    note: `${e.count} ${t.owner.timesShort}`,
    value: e.revenue,
    money: money(e.revenue),
  }));

  const costRows: BarRow[] = costs.map((c) => ({
    key: `${c.category}-${c.monthly}`,
    name: c.category,
    note: c.monthly ? t.expenses.perMonth : t.expenses.oneOff,
    value: c.amount,
    money: money(c.amount),
  }));

  /* Способы оплаты — только те, что встретились. Строка «Փոխանցում 0 ֏ ·
     0 %» сообщает ровно то же, что её отсутствие, и занимает место. */
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
      name: s.name ?? '—',
      color: personColor(s.name),
      count: s.count,
      earned: money(s.earned),
    }));

  /* Сравнение считается по прибыли: плита показывает её, и строка под
     ней обязана объяснять именно то число, которое над ней стоит.

     Процент — только когда в базе была прибыль. От нуля и от убытка
     процент не считается: «+100 %» к нулю сообщает не о росте, а о том,
     что раньше сравнивать было не с чем. */
  const delta = base ? current.profit - base.profit : null;
  const growth =
    base && base.profit > 0 && delta !== null ? Math.round((delta / base.profit) * 100) : null;

  return (
    <>
      {/* Полоса месяцев отсюда убрана.

          Способов выбрать месяц на этой странице было три: жёлоб в
          шапке, столбики графика и строки таблицы. Два последних —
          лучше по устройству: у них рядом с названием месяца стоит его
          число, то есть выбирают, посмотрев, а не наугад. Жёлоб же
          называл шесть месяцев подряд и не говорил о них ничего, зато
          занимал целую строку над ответом.

          Открытый месяц по-прежнему подсвечен — и в графике, и в
          таблице, — а адрес его остался прежним: ссылку на разбор
          можно послать себе же. */}
      <PageHead title={t.reports.title} meta={t.reports.note} />

      <ReportSummary
        currency={tenant.currency}
        revenue={current.revenue}
        payroll={current.payroll}
        costs={current.costs}
        profit={current.profit}
        kept={current.kept}
        monthName={monthName(current)}
      />

      {/* Операционная строка: сколько машин, по какому чеку и куда
          сдвинулся итог. Сравнение стоит здесь, а не на плите: цвет на
          тёмной плите означал бы тревогу, а это обычная разница между
          двумя месяцами. */}
      <p className="quick">
        <b className="num">{current.count}</b> {tenant.unitOne}
        {current.avgCheck > 0 && (
          <>
            <i />
            {t.owner.avgCheck} <b className="num">{money(current.avgCheck)}</b>
          </>
        )}
        <i />
        <span
          className="num font-semibold"
          style={{
            color:
              delta === null
                ? 'var(--board-muted)'
                : delta >= 0
                  ? 'var(--good-on-board)'
                  : 'var(--warn-on-board)',
          }}
        >
          {delta === null
            ? t.owner.noBase
            : `${delta >= 0 ? '+' : '−'}${
                growth !== null ? `${Math.abs(growth)}%` : money(Math.abs(delta))
              } ${t.owner.vsPrev}`}
        </span>
      </p>

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <Trend points={trend} currency={tenant.currency} unitOne={tenant.unitOne} />

        <ProfitSplit
          className="lg:col-span-4"
          currency={tenant.currency}
          revenue={current.revenue}
          payroll={current.payroll}
          costs={current.costs}
          profit={current.profit}
        />

        {/* Откуда пришло, куда ушло и чем платили — три разреза одного
            месяца, поэтому в один ряд и одинакового веса. */}
        <Bars
          className="lg:col-span-4"
          title={t.reports.whereFrom}
          rows={services}
          total={services.reduce((s, r) => s + r.value, 0)}
          tone="var(--tone-violet-glow)"
          empty={t.reports.emptyMonth}
        />

        <Bars
          className="lg:col-span-4"
          title={t.reports.whereGone}
          rows={costRows}
          total={current.costs}
          tone="var(--tone-amber-glow)"
          empty={t.expenses.empty}
        />

        <Bars
          className="lg:col-span-4"
          title={t.today.paidWith}
          rows={payments}
          total={paidTotal}
          tone="var(--tone-teal-glow)"
          empty={t.today.noPayments}
        />

        <ReportTeam
          className="lg:col-span-4"
          rows={team}
          unitOne={tenant.unitOne}
          staffRole={t.settings.staff}
        />

        <MonthsTable className="lg:col-span-8" rows={monthRows} unitOne={tenant.unitOne} />
      </div>
    </>
  );
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
