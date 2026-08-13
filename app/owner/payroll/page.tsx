import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import {
  getSettledUntil,
  getTenant,
  getUnsettledByDay,
  getUnsettledPayroll,
  listPayouts,
} from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { IconCar, IconIncome, IconPeople, IconWallet } from '@/components/flow-icons';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { PayButton } from '@/components/pay-button';
import { dayMonth, hhmm } from '@/lib/time';

/**
 * Зарплаты.
 *
 * Пересобрана по тем же правилам, что и сводка: показание одно, приборы
 * одинакового веса, плотность выше воздуха.
 *
 * Порядок чтения задан вопросами, с которыми сюда заходят, а не тем,
 * что удобнее сверстать: сколько раздать всего → кому именно → на каком
 * основании → что уже отдано. Первые три помещаются над сгибом.
 */
export default async function PayrollPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const [rows, days, settled, history] = await Promise.all([
    getUnsettledPayroll(tenant.id),
    getUnsettledByDay(tenant.id, tenant.timezone),
    getSettledUntil(tenant.id),
    listPayouts(tenant.id),
  ]);

  const daysOf = (staffId: string | null) => days.filter((d) => d.staffId === staffId);

  const money = (n: number) => formatMoney(n, tenant.currency);
  const due = rows.reduce((sum, r) => sum + r.earned, 0);
  const revenue = rows.reduce((sum, r) => sum + r.revenue, 0);
  const cars = rows.reduce((sum, r) => sum + r.count, 0);
  const owing = rows.filter((r) => r.earned > 0).length;

  return (
    <>
      <PageHead title={hy.owner.tabPayroll} meta={hy.owner.payrollNote} />

      {/* Полоса той же формы, что на сводке: продукт должен отвечать
          одинаково на всех своих экранах, иначе каждый раздел приходится
          читать заново.

          Знаков вычитания здесь нет, и это честно: зарплата — не остаток
          от выручки, а доля в ней, и «минус» между ними обещал бы
          арифметику, которой не происходит. Итог всё равно выделен: он
          и есть то, ради чего сюда заходят. */}
      <FlowStrip
        links={[
          { label: tenant.staffRole, value: String(owing), icon: IconPeople, tone: 'teal' },
          { label: tenant.unitOne, value: String(cars), icon: IconCar, tone: 'teal' },
          { label: hy.owner.revenue, value: money(revenue), icon: IconIncome, tone: 'violet' },
          {
            label: hy.owner.toPay,
            value: money(due),
            strong: true,
            icon: IconWallet,
            tone: 'lime',
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
        {rows.length === 0 ? (
          <Panel>
            <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
              {hy.owner.nothingDue}
            </p>
          </Panel>
        ) : (
          /* Люди — плоскими карточками в два-три ряда, а не градиентными
             плитками во всю ширину.

             Плитка светилась цветом человека и весила на экране втрое
             больше всего остального: на странице, где всё содержимое —
             деньги, самым громким оказывался фон. Цвет остался там, где
             он работает, — точкой у имени, той же, что в ленте и на
             смене; вес у карточек теперь одинаковый, и различает их
             сумма, а не заливка. */
          <div className="grid gap-[var(--seam)] sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((r) => (
              <Panel key={r.staffId ?? 'none'} className="justify-between">
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full"
                        style={{ background: personColor(r.name) }}
                        aria-hidden
                      />
                      <span
                        className="truncate text-[15px] font-semibold"
                        style={{ color: 'var(--on-board)' }}
                      >
                        {r.name ?? '—'}
                      </span>
                    </span>

                    <span
                      className="num shrink-0 text-[22px] leading-none font-bold tracking-[-0.03em]"
                      style={{ color: 'var(--on-board)' }}
                    >
                      {money(r.earned)}
                    </span>
                  </div>

                  {/* Основание расчёта рядом с суммой, а не спрятано: это
                      то, чем владелец проверяет цифру, прежде чем отдать
                      деньги.

                      Ставка — та, по которой ПОСЧИТАНО, а не та, что
                      стоит у человека сейчас. После смены процента три
                      числа переставали перемножаться, и верная сумма
                      читалась обманом. Менялась за период — показываем
                      вилку. */}
                  <div
                    className="num mt-1.5 text-[12px]"
                    style={{ color: 'var(--board-muted)' }}
                  >
                    {r.count} {tenant.unitOne} · {money(r.revenue)} ·{' '}
                    {r.pctFrom === r.pctTo
                      ? `${r.pctFrom ?? r.percent ?? 0}%`
                      : `${r.pctFrom}–${r.pctTo}%`}
                    {settled.has(r.staffId ?? '') && (
                      <>
                        {' · '}
                        {hy.owner.sinceLastPayout}{' '}
                        {shortDate(settled.get(r.staffId ?? ''), tenant.timezone)}
                      </>
                    )}
                  </div>

                  <Breakdown
                    days={daysOf(r.staffId)}
                    unit={tenant.unitOne}
                    money={money}
                  />
                </div>

                {r.staffId && r.earned > 0 && (
                  <div className="mt-4">
                    <PayButton
                      staffId={r.staffId}
                      label={hy.owner.markPaid}
                      name={r.name ?? '—'}
                      amount={money(r.earned)}
                    />
                  </div>
                )}
              </Panel>
            ))}
          </div>
        )}

        {/* История — таблицей во всю ширину, а не списком в узкой колонке.

            Она отвечает на вопрос «кому и когда я уже отдавал», и
            отвечает сравнением строк: даты в столбец, суммы в столбец.
            В колонке шириной в треть экрана период не помещался и
            прижимался к имени, из-за чего две соседние выплаты
            приходилось читать по отдельности. */}
        {history.length > 0 && (
          <Panel title={hy.owner.payoutHistory} count={history.length}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>{tenant.staffRole}</th>
                  <th>{hy.owner.colPeriod}</th>
                  <th className="end">{hy.owner.colPrice}</th>
                </tr>
              </thead>
              <tbody>
                {history.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <span className="flex items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: personColor(p.staffName) }}
                          aria-hidden
                        />
                        <span className="truncate font-medium">{p.staffName ?? '—'}</span>
                      </span>
                    </td>
                    {/* Период — и когда за него отдали.

                        «11.08 — 11.08» одного дня читалось как ошибка, а
                        пять строк с одинаковыми датами — как одна выплата,
                        напечатанная пять раз. День, повторённый дважды,
                        сжат в одну дату; под ней стоит момент выдачи, и
                        соседние строки перестают быть близнецами. */}
                    <td className="num" style={{ color: 'var(--board-muted)' }}>
                      {p.periodFrom.getTime() === 0
                        ? `${hy.owner.upTo} ${shortDate(p.periodTo, tenant.timezone)}`
                        : shortDate(p.periodFrom, tenant.timezone) ===
                            shortDate(p.periodTo, tenant.timezone)
                          ? shortDate(p.periodTo, tenant.timezone)
                          : `${shortDate(p.periodFrom, tenant.timezone)} — ${shortDate(p.periodTo, tenant.timezone)}`}
                      <span className="block text-[11.5px]" style={{ opacity: 0.7 }}>
                        {hy.owner.paidAt} {dayMonth(p.paidAt, tenant.timezone)}{' '}
                        {hhmm(p.paidAt, tenant.timezone)}
                      </span>
                    </td>
                    <td className="num end font-semibold">{money(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}

/**
 * Разбивка по дням под суммой.
 *
 * Одна растущая сумма не читается: у мойщика, которому не платили
 * неделю, стоит «21 машина», и владелец не понимает, за что это — за
 * сегодня, за вчера или за месяц. Деньги, которые нельзя разложить на
 * дни, вызывают ровно тот спор, ради устранения которого продукт и
 * написан.
 *
 * Дни без начисления сложены в одну строку, длинный хвост платных —
 * тоже: у владельца, который сам мыл месяц по нулевой ставке, разбивка
 * выходила в двадцать строк «0 ֏» и хоронила под собой те два дня, за
 * которые он действительно должен.
 */
function Breakdown({
  days,
  unit,
  money,
}: {
  days: { day: string; count: number; earned: number }[];
  unit: string;
  money: (n: number) => string;
}) {
  if (days.length < 2) return null;

  const paying = days.filter((d) => d.earned > 0);
  const idle = days.filter((d) => d.earned === 0);
  const shown = paying.slice(0, 5);
  const rest = paying.slice(5);

  const line = (left: string, right: string, dim: number) => (
    <div
      key={left}
      className="num flex items-baseline justify-between gap-2 text-[12px]"
      style={{ color: 'var(--board-muted)', opacity: dim }}
    >
      <span>{left}</span>
      <span className="font-semibold">{right}</span>
    </div>
  );

  return (
    <div
      className="mt-3 grid gap-1 pt-2.5"
      style={{ borderTop: '1px solid var(--hairline)' }}
    >
      {shown.map((d) => line(`${dayLabel(d.day)} · ${d.count} ${unit}`, money(d.earned), 1))}
      {rest.length > 0 &&
        line(
          `+ ${rest.length} ${hy.owner.daysShort}`,
          money(rest.reduce((s, d) => s + d.earned, 0)),
          1,
        )}
      {idle.length > 0 &&
        line(
          `${idle.length} ${hy.owner.daysShort} · ${idle.reduce((s, d) => s + d.count, 0)} ${unit}`,
          money(0),
          0.6,
        )}
    </div>
  );
}

/** `2026-08-10` → `10.08`. Год не показываем: неоплаченное за год —
    не тот случай, ради которого стоит занимать место в строке. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

/**
 * Дата в часовом поясе мойки.
 *
 * Раньше здесь стояло `getDate()` с припиской «без локали: Intl
 * расходится между сервером и браузером». Расхождение было настоящим, но
 * лечили не то: `getDate()` тоже читает зону того, кто считает, — просто
 * молча, и выплата, отмеченная сразу после полуночи, показывалась
 * вчерашним числом. Зона передаётся явно — см. `dayMonth`.
 */
function shortDate(d: Date | null | undefined, timezone: string): string {
  if (!d || d.getTime() <= 0) return '—';
  return dayMonth(d, timezone);
}
