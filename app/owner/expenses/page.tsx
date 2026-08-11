import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, startOfMonth, startOfPrevMonth } from '@/lib/queries';
import { currencySymbol, formatAmount, formatMoney, toMajor } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { EXPENSE_HINTS, listExpenses } from '@/lib/expenses';
import { dayMonth, daysInMonthOf } from '@/lib/time';
import { ExpenseRow } from '@/components/expense-row';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { PageHead } from '@/components/page-head';
import { AddExpenseForm } from './add-expense-form';
import { MonthTabs, type MonthKey } from './month-tabs';

/**
 * Расходы бизнеса.
 *
 * Считаются календарным месяцем, а не скользящими тридцатью днями.
 * Скользящее окно давало десятого августа июльские траты в списке, и
 * итог складывал их как августовские. Владелец думает месяцами — так он
 * платит аренду и так сверяется с прибылью, — и граница периода должна
 * совпадать с той, которой он считает сам. То же правило уже работает в
 * приложении; здесь оно повторено, чтобы два экрана одного продукта не
 * отвечали на один вопрос по-разному.
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
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { m } = await searchParams;
  const month: MonthKey = m === 'prev' ? 'prev' : 'current';
  const prev = month === 'prev';

  const from = prev ? startOfPrevMonth(tenant.timezone) : startOfMonth(tenant.timezone);
  const to = prev ? startOfMonth(tenant.timezone) : undefined;

  const rows = await listExpenses(tenant.id, from, to);

  const money = (n: number) => formatMoney(n, tenant.currency);
  // у драма нет копеек, у рубля есть — шаг ввода берём из валюты
  const step = toMajor(1, tenant.currency);
  const days = daysInMonthOf(tenant.timezone, from);

  const monthly = rows.filter((e) => e.monthly);
  const oneOff = rows.filter((e) => !e.monthly);
  const sum = (list: typeof rows) => list.reduce((s, e) => s + e.amount, 0);
  const spentMonthly = sum(monthly);
  const spentOneOff = sum(oneOff);

  return (
    <>
      <PageHead title={hy.expenses.title} meta={hy.expenses.note}>
        <MonthTabs current={month} />
      </PageHead>

      {/* Итог покрывает всё, что показано ниже.

          Стояло «Ամսական ծախս» одним числом, а под ним лежали ещё и
          разовые: верхняя цифра отвечала не на тот вопрос, с которым
          сюда заходят, и человек читал её как «столько я потратил»,
          недосчитываясь разовых. Полоса складывает обе части на глазах —
          знаки здесь плюс и равно, потому что тут именно сложение, а не
          вычет. */}
      <FlowStrip
        links={[
          { label: hy.expenses.monthlyOnes, value: money(spentMonthly) },
          { label: hy.expenses.oneOffs, value: money(spentOneOff), sign: '+' },
          {
            label: hy.owner.expensesTotal,
            value: money(spentMonthly + spentOneOff),
            sign: '=',
            strong: true,
            note:
              spentMonthly > 0
                ? `${hy.expenses.perDay} ${money(Math.round(spentMonthly / days))}`
                : undefined,
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        {/* Два раздела вместо одного списка вперемешку.

            Раньше постоянные и разовые лежали рядом и различались словом
            «ամսական» мелким шрифтом под названием — то есть не
            различались вовсе. Это разные деньги: одни уходят каждый
            месяц сами, другие потрачены один раз и больше не повторятся. */}
        <div className="grid content-start gap-[var(--seam)] lg:col-span-8">
          {rows.length === 0 && (
            <Panel>
              <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.expenses.empty}
              </p>
            </Panel>
          )}

          {monthly.length > 0 && (
            <Panel title={hy.expenses.monthlyOnes} count={monthly.length}>
              <div className="rows">
                {monthly.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    id={e.id}
                    category={e.category}
                    amount={toMajor(e.amount, tenant.currency)}
                    display={formatAmount(e.amount, tenant.currency)}
                    monthly
                    when={`${hy.expenses.perMonth} · ${hy.expenses.perDay} ${money(
                      Math.round(e.amount / days),
                    )}`}
                    currencySymbol={currencySymbol(tenant.currency)}
                    step={step}
                  />
                ))}
              </div>
            </Panel>
          )}

          {oneOff.length > 0 && (
            <Panel title={hy.expenses.oneOffs} count={oneOff.length}>
              <div className="rows">
                {oneOff.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    id={e.id}
                    category={e.category}
                    amount={toMajor(e.amount, tenant.currency)}
                    display={formatAmount(e.amount, tenant.currency)}
                    monthly={false}
                    when={dayMonth(e.at, tenant.timezone)}
                    currencySymbol={currencySymbol(tenant.currency)}
                    step={step}
                  />
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* Форма стоит справа и не уезжает: расходы заводят пачкой — раз
            в неделю за всю неделю, — и список рядом показывает, что уже
            записано, пока человек печатает следующее.

            В прошлом месяце заводить нечего: запись всё равно легла бы
            сегодняшним числом и в открытом периоде бы не появилась. */}
        {!prev && (
          <div className="lg:col-span-4">
            <Panel title={hy.expenses.add}>
              <AddExpenseForm
                currencySymbol={currencySymbol(tenant.currency)}
                hints={EXPENSE_HINTS}
              />
            </Panel>
          </div>
        )}
      </div>
    </>
  );
}
