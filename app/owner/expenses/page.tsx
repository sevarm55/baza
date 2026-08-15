import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getPeriodStats, getTenant } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { expenseHints, getPeriodCosts, listPeriodExpenses } from '@/lib/expenses';
import { windowFor } from '@/lib/summary-window';
import { startOfDaysAgo, ymd } from '@/lib/time';
import { PageHead } from '@/components/page-head';
import { AddExpense } from './add-expense';
import { ExpenseList } from './expense-list';
import { ExpensesSummary } from './summary';
import { MonthTabs, type MonthKey } from './month-tabs';
import type { ExpenseDay, ExpenseItem } from './model';
import { getDict } from '@/lib/i18n/server';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';

/**
 * Расходы бизнеса.
 *
 * Страница отвечает на один вопрос: куда уходят деньги. И отвечает в том
 * порядке, в каком его задают:
 *
 *   1. сколько ушло за месяц       → плита наверху;
 *   2. из чего это сложилось       → три слагаемых рядом с ней;
 *   3. что уходит каждый месяц     → постоянные списком;
 *   4. что потрачено разово        → разовые по дням;
 *   5. почему именно столько       → карточка расхода.
 *
 * Раньше это была полоса из трёх равных карточек и один список, где
 * аренда и канистра химии различались словом «ամսական» мелким шрифтом.
 * Между тем это разные деньги: одни уходят каждый месяц сами, другие
 * потрачены один раз и завтра их может не быть, — и решения по ним тоже
 * разные.
 *
 * Считаются расходы календарным месяцем, а не скользящими тридцатью
 * днями. Скользящее окно давало десятого августа июльские траты в
 * списке, и итог складывал их как августовские. Владелец думает
 * месяцами — так он платит аренду и так сверяется с прибылью, — и
 * граница периода должна совпадать с той, которой он считает сам. То же
 * правило работает в приложении.
 *
 * Постоянный расход попадает в месяц, если он в нём ДЕЙСТВОВАЛ: заведён
 * до конца месяца и не закрыт до его начала. Проверять только «не
 * закрыт» нельзя — закрытая в июле аренда обязана остаться в июльском
 * счёте, иначе прошлый месяц задним числом дешевеет.
 */
export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { m } = await searchParams;
  const month: MonthKey = m === 'prev' ? 'prev' : 'current';
  const prev = month === 'prev';

  /* Границы берёт то же окно, что и сводка: у двух разделов одного
     продукта не должно быть двух представлений о том, что такое «этот
     месяц». */
  const period = windowFor(prev ? 'prevmonth' : 'month', tenant.timezone);

  const [rows, costs, stats] = await Promise.all([
    listPeriodExpenses(tenant.id, period.from, period.to, period.spread, {
      activeMonthlyOnly: !prev,
    }),
    getPeriodCosts(tenant.id, period.from, period.to, period.spread),
    /* Выручка нужна ради одного числа под итогом — доли расходов в ней.
       Сумма сама по себе не плохая и не хорошая: сто тысяч при выручке
       в миллион это обычный месяц, а при выручке в двести — беда. */
    getPeriodStats(tenant.id, period.from, period.to),
  ]);

  const zone = tenant.timezone;
  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  // у драма нет копеек, у рубля есть — шаг ввода берём из валюты
  const step = toMajor(1, tenant.currency);
  /* Часы читает `lib/time`, а не разметка: `Date.now()` в теле
     серверного компонента — обращение к изменчивому во время отрисовки. */
  const todayKey = ymd(startOfDaysAgo(zone, 0), zone);
  const yesterdayKey = ymd(startOfDaysAgo(zone, 1), zone);

  const longDay = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    timeZone: zone,
  });
  const monthName = new Intl.DateTimeFormat(intlLocale(t.locale), {
    month: 'long',
    timeZone: zone,
  }).format(period.from);

  const toItem = (e: (typeof rows)[number]): ExpenseItem => ({
    id: e.id,
    category: e.category,
    monthly: e.monthly,
    amount: e.amount,
    share: e.share,
    /* Дневная доля считается от длины месяца — того же знаменателя,
       которым доля периода посчитана в базе. Делить на прожитые дни
       нельзя: первого числа аренда стоила бы месячную сумму в сутки. */
    perDay: e.monthly ? Math.round(e.amount / period.spread) : 0,
    major: toMajor(e.amount, tenant.currency),
    display: formatAmount(e.amount, tenant.currency, t.locale),
    day: longDay.format(e.at),
    dayKey: ymd(e.at, zone),
    closed: e.endedAt !== null,
    closedOn: e.endedAt ? t.expenses.until(longDay.format(e.endedAt)) : null,
    note: e.note,
  });

  const monthly = rows.filter((e) => e.monthly).map(toItem);
  const oneOff = rows.filter((e) => !e.monthly).map(toItem);

  /* Разовые собираются по дням в порядке, в каком пришли из базы, —
     от свежего к старому. Ключ дня в поясе бизнеса: собранный в зоне
     сервера, он резал бы вечерние траты на два дня. */
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
  const biggest = [...rows].sort((a, b) => b.share - a.share)[0] ?? null;

  return (
    <>
      <PageHead title={t.expenses.title} meta={t.expenses.lead}>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <MonthTabs current={month} />
          {/* В прошлом месяце заводить нечего: запись всё равно легла бы
              его последним днём и в открытом периоде бы не появилась. */}
          {!prev && (
            <AddExpense
              currencySymbol={currencySymbol(tenant.currency)}
              hints={expenseHints(t.locale)}
              today={todayKey}
            />
          )}
        </div>
      </PageHead>

      <ExpensesSummary
        currency={tenant.currency}
        total={costs.total}
        monthlyShare={costs.monthlyShare}
        monthlyNominal={monthlyNominal}
        oneOff={costs.oneOff}
        /* Среднее считается по прожитым дням периода, а не по длине
           месяца: пятого числа «в день» это пятая часть потраченного, а
           не тридцатая. */
        perDay={period.days > 0 ? Math.round(costs.total / period.days) : 0}
        revenue={stats.revenue}
        monthName={monthName}
      />

      {/* Операционная строка — предложением, а не четвёртой карточкой.
          Сколько записей и что из них весит больше всех: «главный
          расход — аренда» это ответ, за которым иначе пришлось бы
          сравнивать строки списка глазами. */}
      {rows.length > 0 && (
        <p className="quick">
          <b className="num">{rows.length}</b> {t.expenses.records(rows.length)}
          {/* Самый крупный расход называется, только когда есть из чего
              выбирать: под единственной строкой «самый большой» — это её
              же название, написанное второй раз. */}
          {rows.length > 1 && biggest && biggest.share > 0 && (
            <>
              <i />
              {t.expenses.biggest} <b>{biggest.category}</b>{' '}
              <b className="num">{money(biggest.share)}</b>
            </>
          )}
        </p>
      )}

      <div className="mt-[var(--seam)]">
        <ExpenseList
          monthly={monthly}
          days={days}
          oneOffCount={oneOff.length}
          currency={tenant.currency}
          currencySymbol={currencySymbol(tenant.currency)}
          hints={expenseHints(t.locale)}
          step={step}
          today={todayKey}
          readOnly={prev}
        />
      </div>
    </>
  );
}

/**
 * «Այսօր · 15 օգոստոսի», «Երեկ · 14 օգոստոսի» или просто число.
 *
 * Ближние два дня называются словом, потому что именно так о них и
 * спрашивают: «сколько я потратил сегодня». Дальше слово перестаёт
 * помогать — «позавчера» уже надо перевести в дату, чтобы сверить с
 * чеком, — и остаётся число.
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
