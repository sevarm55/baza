import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { PageHead } from '@/components/page-head';
import { IconCar, IconIncome, IconOutcome, IconPeople, IconWallet } from '@/components/flow-icons';
import { daysInMonthOf } from '@/lib/time';
import {
  getCostsByCategory,
  getEarnedByService,
  getMonthlyReport,
  type ReportMonth,
} from '@/lib/reports';

/** Сколько месяцев показываем в таблице. */
const MONTHS = 6;

/**
 * Отчёты.
 *
 * Кабинет отвечает «сколько сегодня» и «сколько в этом месяце». Вопрос,
 * который владелец задаёт себе на самом деле, другой: **лучше или хуже
 * стало** — и **куда уходят деньги**. Ответить было нечем: приходилось
 * переключать периоды и держать числа в голове.
 *
 * Страница отвечает тремя вещами подряд, и порядок не случайный:
 *
 *   1. Итог выбранного месяца — той же цепочкой, что на сводке.
 *   2. Полгода строками: у каждого месяца выручка, зарплата, расходы,
 *      осталось и доля. Сравнивать месяцы глазами по столбцу — то, ради
 *      чего таблица и существует.
 *   3. Куда ушли и откуда пришли: расходы по названиям, выручка по
 *      услугам. Одна сумма не говорит, что с ней делать; разбивка
 *      говорит.
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
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const months = await getMonthlyReport(tenant.id, tenant.timezone, MONTHS);

  const asked = Number((await searchParams).m ?? 0);
  const index = Number.isFinite(asked) && asked >= 0 && asked < months.length ? asked : 0;
  const current = months[index];

  const [costs, earned] = await Promise.all([
    getCostsByCategory(
      tenant.id,
      current.from,
      current.to,
      daysInMonthOf(tenant.timezone, current.from),
    ),
    getEarnedByService(tenant.id, current.from, current.to),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency);
  const monthName = (m: ReportMonth) =>
    new Intl.DateTimeFormat('hy-AM', { month: 'long', timeZone: tenant.timezone }).format(m.from);

  return (
    <>
      <PageHead title={hy.reports.title} meta={hy.reports.note}>
        {/* Месяцы жёлобом, как период на сводке: тот же орган управления
            на всех экранах, где выбирают срок. */}
        <nav
          className="scroll-x flex max-w-full gap-0.5 rounded-[8px] p-[3px]"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
        >
          {months.map((m, i) => (
            <a
              key={m.from.toISOString()}
              href={i === 0 ? '/owner/reports' : `/owner/reports?m=${i}`}
              aria-current={i === index ? 'page' : undefined}
              className="rounded-[6px] px-3 py-1.5 text-[13px] whitespace-nowrap transition-colors"
              style={
                i === index
                  ? { background: 'var(--on-board)', color: 'var(--board)', fontWeight: 600 }
                  : { color: 'var(--board-muted)' }
              }
            >
              {monthName(m)}
            </a>
          ))}
        </nav>
      </PageHead>

      {/* Та же цепочка, что на сводке: продукт обязан отвечать одинаково
          на всех своих экранах, иначе каждый читают заново. */}
      <FlowStrip
        links={[
          { label: tenant.unitOne, value: String(current.count), icon: IconCar, tone: 'teal' },
          {
            label: hy.owner.revenue,
            value: money(current.revenue),
            icon: IconIncome,
            tone: 'violet',
          },
          {
            label: hy.owner.payroll,
            value: money(current.payroll),
            sign: '−',
            icon: IconPeople,
            tone: 'teal',
          },
          {
            label: hy.owner.costs,
            value: money(current.costs),
            sign: '−',
            icon: IconOutcome,
            tone: 'amber',
          },
          {
            label: hy.owner.profit,
            value: money(current.profit),
            sign: '=',
            strong: true,
            icon: IconWallet,
            tone: 'lime',
            note: current.revenue > 0 ? `${current.kept}% ${hy.owner.kept}` : undefined,
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
        {/* Полгода строками. Ради этого экран и заводился: месяц рядом с
            месяцем, а не по одному через переключатель. */}
        <Panel title={hy.reports.byMonth} count={months.length}>
          <div className="board-journal lg:hidden">
            {months.map((m) => (
              <div key={m.from.toISOString()} className="flex items-center gap-2.5 px-0.5 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14.5px] font-semibold">{monthName(m)}</span>
                  <span
                    className="num block truncate text-[12px]"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    {m.count} {tenant.unitOne} · {money(m.revenue)}
                  </span>
                </span>
                <span className="shrink-0 text-end">
                  <span
                    className="num block text-[14px] font-semibold"
                    style={{ color: m.profit < 0 ? 'var(--warn-on-board)' : undefined }}
                  >
                    {money(m.profit)}
                  </span>
                  <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                    {m.kept}%
                  </span>
                </span>
              </div>
            ))}
          </div>

          <table className="tbl hidden lg:table">
            <thead>
              <tr>
                <th>{hy.reports.month}</th>
                <th className="end">{tenant.unitOne}</th>
                <th className="end">{hy.owner.revenue}</th>
                <th className="end">{hy.owner.payroll}</th>
                <th className="end">{hy.owner.costs}</th>
                <th className="end">{hy.owner.profit}</th>
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m.from.toISOString()}>
                  <td className="font-medium">{monthName(m)}</td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {m.count || '—'}
                  </td>
                  <td className="num end">{money(m.revenue)}</td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {money(m.payroll)}
                  </td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {money(m.costs)}
                  </td>
                  {/* Итог месяца и доля в одной ячейке: их читают вместе —
                      «сто тысяч, это сорок процентов», — и разнесённые по
                      столбцам они гоняют глаз туда-обратно. */}
                  <td className="num end">
                    <span
                      className="block font-semibold"
                      style={{ color: m.profit < 0 ? 'var(--warn-on-board)' : undefined }}
                    >
                      {money(m.profit)}
                    </span>
                    <span className="block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                      {m.kept}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <div className="grid gap-[var(--seam)] lg:grid-cols-2">
          {/* Куда ушли. Одна сумма расходов не говорит, что с ней делать;
              названия говорят: аренду не подвинешь, а на химии, которая
              внезапно стоит как аренда, экономить можно уже завтра. */}
          <Panel title={hy.reports.whereGone} count={costs.length}>
            {costs.length === 0 ? (
              <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.expenses.empty}
              </p>
            ) : (
              <Bars
                rows={costs.map((c) => ({
                  name: c.category,
                  note: c.monthly ? hy.expenses.perMonth : hy.expenses.oneOff,
                  value: c.amount,
                }))}
                total={current.costs}
                money={money}
                tone="var(--tone-amber-glow)"
              />
            )}
          </Panel>

          {/* Откуда пришли. По названию из самой записи, а не по ссылке на
              прейскурант: услугу могли удалить, а деньги остались. */}
          <Panel title={hy.reports.whereFrom} count={earned.length}>
            {earned.length === 0 ? (
              <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.common.empty}
              </p>
            ) : (
              <Bars
                rows={earned.map((e) => ({
                  name: e.name,
                  note: `${e.count} ${hy.owner.timesShort}`,
                  value: e.revenue,
                }))}
                total={earned.reduce((s, e) => s + e.revenue, 0)}
                money={money}
                tone="var(--tone-violet-glow)"
              />
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

/**
 * Разбивка полосками.
 *
 * Доля рисуется, а не пишется процентом: «аренда — половина всех
 * расходов» видно длиной строки раньше, чем прочитано число. Проценты
 * при этом остаются — но вторыми, для тех, кто хочет точности.
 */
function Bars({
  rows,
  total,
  money,
  tone,
}: {
  rows: { name: string; note: string; value: number }[];
  total: number;
  money: (n: number) => string;
  tone: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className="grid gap-3">
      {rows.map((r) => (
        <div key={r.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[14px] font-medium">{r.name}</span>
            <span className="num shrink-0 text-[14px] font-semibold">{money(r.value)}</span>
          </div>

          <div className="mt-1.5 flex items-center gap-2.5">
            <span
              className="h-1.5 flex-1 overflow-hidden rounded-[3px]"
              style={{ background: 'color-mix(in srgb, var(--board-ink) 8%, transparent)' }}
            >
              <span
                className="block h-full rounded-[3px]"
                style={{ width: `${Math.round((r.value / max) * 100)}%`, background: tone }}
              />
            </span>
            <span
              className="num shrink-0 text-[12px] tabular-nums"
              style={{ color: 'var(--board-muted)' }}
            >
              {total > 0 ? Math.round((r.value / total) * 100) : 0}% · {r.note}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
