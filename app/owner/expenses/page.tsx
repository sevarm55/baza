import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPeriodStats, getTenant } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, formatShare, toMajor } from '@/lib/money';
import { expenseHints, getPeriodCosts, listPeriodExpenses } from '@/lib/expenses';
import { windowFor } from '@/lib/summary-window';
import { startOfDaysAgo, ymd } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { longDay, monthName } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { Segmented } from '@/components/patterns/segmented';
import { AddExpense } from './add-expense';
import { ExpenseList } from './expense-list';
import type { ExpenseDay, ExpenseItem } from './model';

/**
 * Расходы бизнеса.
 *
 * Страница отвечает на один вопрос: куда уходят деньги. Порядок тот же,
 * в каком его задают: сколько ушло за месяц, из чего это сложилось,
 * что уходит каждый месяц само, что потрачено разово, почему именно
 * столько (карточка расхода).
 *
 * Считается календарным месяцем, а не скользящими тридцатью днями:
 * владелец думает месяцами, так он платит аренду и так сверяется с
 * прибылью. Постоянный расход попадает в месяц, если в нём действовал.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  /* `new` приводит сюда с уже открытой формой: расход заводят со
     сводки одним нажатием вместо двух. */
  searchParams: Promise<{ m?: string; new?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const params = await searchParams;
  const prev = params.m === 'prev';
  const openNew = params.new === '1';

  /* Границы берёт то же окно, что и сводка: у двух разделов одного
     продукта не должно быть двух представлений о том, что такое «этот
     месяц». */
  const period = windowFor(prev ? 'prevmonth' : 'month', tenant.timezone);

  const [rows, costs, stats] = await Promise.all([
    listPeriodExpenses(tenant.id, period.from, period.to, period.spread, {
      activeMonthlyOnly: !prev,
    }),
    getPeriodCosts(tenant.id, period.from, period.to, period.spread),
    /* Выручка нужна ради одного числа под итогом: доли расходов в ней.
       Сумма сама по себе не плохая и не хорошая. */
    getPeriodStats(tenant.id, period.from, period.to),
  ]);

  const zone = tenant.timezone;
  // у драма нет копеек, у рубля есть: шаг ввода берём из валюты
  const step = toMajor(1, tenant.currency);
  /* Часы читает `lib/time`, а не разметка: `Date.now()` в теле
     серверного компонента это обращение к изменчивому во время отрисовки. */
  const todayKey = ymd(startOfDaysAgo(zone, 0), zone);
  const yesterdayKey = ymd(startOfDaysAgo(zone, 1), zone);

  const dayFmt = longDay(t.locale, zone);
  const month = monthName(t.locale, zone).format(period.from);
  const symbol = currencySymbol(tenant.currency);
  const hints = expenseHints(t.locale);
  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);

  const toItem = (e: (typeof rows)[number]): ExpenseItem => ({
    id: e.id,
    category: e.category,
    monthly: e.monthly,
    amount: e.amount,
    share: e.share,
    /* Дневная доля считается от длины месяца, тем же знаменателем,
       которым доля периода посчитана в базе. */
    perDay: e.monthly ? Math.round(e.amount / period.spread) : 0,
    major: toMajor(e.amount, tenant.currency),
    display: formatAmount(e.amount, tenant.currency, t.locale),
    day: dayFmt.format(e.at),
    dayKey: ymd(e.at, zone),
    closed: e.endedAt !== null,
    closedOn: e.endedAt ? t.expenses.until(dayFmt.format(e.endedAt)) : null,
    note: e.note,
  });

  const monthly = rows.filter((e) => e.monthly).map(toItem);
  const oneOff = rows.filter((e) => !e.monthly).map(toItem);

  /* Разовые собираются по дням в порядке из базы, от свежего к старому.
     Ключ дня в поясе бизнеса: собранный в зоне сервера, он резал бы
     вечерние траты на два дня. */
  const days: ExpenseDay[] = [];
  for (const item of oneOff) {
    let group = days.find((d) => d.key === item.dayKey);
    if (!group) {
      group = {
        key: item.dayKey,
        title: dayTitle(item.dayKey, item.day, todayKey, yesterdayKey, t),
        total: 0,
        items: [],
      };
      days.push(group);
    }
    group.items.push(item);
    group.total += item.amount;
  }

  /* Номинал действующих постоянных: под накопленной долей должно стоять
     то, из чего она набежала. */
  const monthlyNominal = monthly.reduce((sum, e) => sum + e.amount, 0);
  const share = stats.revenue > 0 ? formatShare(costs.total, stats.revenue) : null;
  /* Среднее по прожитым дням периода, а не по длине месяца: пятого
     числа «в день» это пятая часть потраченного, а не тридцатая. */
  const perDay = period.days > 0 ? Math.round(costs.total / period.days) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title={t.expenses.title}
        description={t.expenses.lead}
        /* В прошлом месяце заводить нечего: запись всё равно легла бы его
           последним днём и в открытом периоде бы не появилась. */
        actions={
          !prev && (
            <AddExpense currencySymbol={symbol} hints={hints} today={todayKey} openNew={openNew} />
          )
        }
      >
        <Segmented
          label={t.owner.periodLabel}
          current={prev ? 'prev' : 'current'}
          items={[
            { key: 'current', label: t.owner.periodMonth, href: '/owner/expenses' },
            { key: 'prev', label: t.owner.periodPrevMonth, href: '/owner/expenses?m=prev' },
          ]}
        />
      </PageHeader>

      <MetricStrip columns={4}>
        <Metric
          size="lg"
          label={t.expenses.title}
          value={money(costs.total)}
          hint={share !== null ? `${month} · ${t.expenses.shareOfRevenue(share)}` : month}
        />
        <Metric
          label={t.expenses.monthlyAccrued}
          value={money(costs.monthlyShare)}
          /* Под накопленной долей стоит номинал, иначе число не с чем
             сверить. */
          hint={monthlyNominal > 0 ? t.expenses.outOf(money(monthlyNominal)) : undefined}
        />
        <Metric label={t.expenses.oneOffs} value={money(costs.oneOff)} />
        <Metric label={t.expenses.perDayAvg} value={money(perDay)} />
      </MetricStrip>

      <ExpenseList
        monthly={monthly}
        days={days}
        oneOffCount={oneOff.length}
        currency={tenant.currency}
        currencySymbol={symbol}
        hints={hints}
        step={step}
        today={todayKey}
        readOnly={prev}
      />
    </div>
  );
}

/**
 * «Այսօր · 15 օգոստոսի», «Երեկ · 14 օգոստոսի» или просто число.
 *
 * Ближние два дня называются словом, потому что так о них спрашивают:
 * «сколько я потратил сегодня». Дальше остаётся число.
 */
function dayTitle(
  key: string,
  formatted: string,
  todayKey: string,
  yesterdayKey: string,
  t: Dict,
): string {
  if (key === todayKey) return `${t.common.today} · ${formatted}`;
  return key === yesterdayKey ? `${t.common.yesterday} · ${formatted}` : formatted;
}
