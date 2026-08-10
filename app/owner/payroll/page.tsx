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
import { Panel, PersonTile, Reading, Row } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { PayButton } from '@/components/pay-button';

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

  /* Слева — люди и суммы, справа — итог и история выплат. На телефоне
     всё это шло подряд, и до истории доходили, пролистав всех
     сотрудников; на широком экране она стоит рядом и видна сразу. */
  return (
    <>
      <PageHead title={hy.owner.tabPayroll} meta={hy.owner.payrollNote} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="lg:col-span-8">
          {rows.length === 0 ? (
            <Panel>
              <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.owner.nothingDue}
              </p>
            </Panel>
          ) : (
            /* Плитки людей в два ряда: на широком экране одна плитка на
               всю ширину растягивает имя и сумму по разным краям
               монитора, и связь между ними теряется. */
            <div className="grid gap-[var(--seam)] sm:grid-cols-2">
              {rows.map((r) => (
                <PersonTile key={r.staffId ?? 'none'} color={personColor(r.name)}>
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[17px] font-bold">{r.name ?? '—'}</div>
                      {/* Основание расчёта рядом с суммой, а не спрятано:
                          это то, чем владелец проверяет цифру, прежде чем
                          отдать деньги.

                          Ставка здесь — та, по которой деньги ПОСЧИТАНЫ,
                          а не та, что стоит у человека сейчас. Стояла
                          текущая, и после любого изменения процента три
                          числа в строке переставали перемножаться: у
                          владельца с двадцатью старыми записями по нулю
                          и одной новой по двадцати выходило «21 машина ·
                          133 500 ֏ · 20%» и рядом 600 ֏. Сумма верная —
                          старые записи хранят свой процент, — но читалось
                          это как ошибка расчёта, а на зарплатах такое
                          читается как обман.

                          Если ставка за период менялась, показываем
                          вилку: одно число тут соврало бы в любом случае. */}
                      <div className="num text-[12px] opacity-75">
                        {r.count} {tenant.unitOne} · {money(r.revenue)} ·{' '}
                        {r.pctFrom === r.pctTo
                          ? `${r.pctFrom ?? r.percent ?? 0}%`
                          : `${r.pctFrom}–${r.pctTo}%`}
                      </div>
                      {settled.has(r.staffId ?? '') && (
                        <div className="num text-[12px] opacity-60">
                          {hy.owner.sinceLastPayout}: {shortDate(settled.get(r.staffId ?? ''))}
                        </div>
                      )}
                    </div>
                    <div className="num shrink-0 text-[24px] leading-none font-bold">
                      {money(r.earned)}
                    </div>
                  </div>

                  {/* По дням, а не одной кучей.

                      Одна растущая сумма не читается: у мойщика, которому
                      не платили неделю, в строке стоит «21 машина», и
                      владелец не понимает, за что это — за сегодня, за
                      вчера или за месяц. Деньги, которые нельзя разложить
                      на дни, вызывают ровно тот спор, ради устранения
                      которого продукт и написан.

                      День закрывается полночью в часовом поясе мойки, а
                      не в восемь вечера: час пришлось бы спрашивать у
                      каждого — одна мойка закрывается в восемь, другая
                      работает до полуночи, — и любой фиксированный час
                      разрезал бы чью-нибудь смену пополам. */}
                  {(() => {
                    const all = daysOf(r.staffId);
                    if (all.length < 2) return null;

                    /* Дни без начисления — одной строкой, а не двадцатью.
                       У владельца, который сам мыл месяц по нулевой
                       ставке, разбивка выходила в двадцать строк «0 ֏» и
                       хоронила под собой те два дня, за которые он
                       действительно должен. Это ровно тот шум, ради
                       которого разбивку и затевали.

                       Строки не выброшены, а сложены: «18 օր · 0 ֏». Так
                       машины по дням по-прежнему сходятся с числом в
                       заголовке, а читать нужно шесть строк, не двадцать. */
                    const paying = all.filter((d) => d.earned > 0);
                    const idle = all.filter((d) => d.earned === 0);
                    const shown = paying.slice(0, 6);
                    const rest = paying.slice(6);

                    return (
                      <div className="mt-3 grid gap-1 border-t border-white/15 pt-2.5">
                        {shown.map((d) => (
                          <div
                            key={d.day}
                            className="num flex items-baseline justify-between gap-2 text-[12.5px]"
                          >
                            <span className="opacity-70">
                              {dayLabel(d.day)} · {d.count} {tenant.unitOne}
                            </span>
                            <span className="font-semibold">{money(d.earned)}</span>
                          </div>
                        ))}

                        {rest.length > 0 && (
                          <div className="num flex items-baseline justify-between gap-2 text-[12.5px] opacity-70">
                            <span>
                              + {rest.length} {hy.owner.daysShort}
                            </span>
                            <span className="font-semibold">
                              {money(rest.reduce((s, d) => s + d.earned, 0))}
                            </span>
                          </div>
                        )}

                        {idle.length > 0 && (
                          <div className="num flex items-baseline justify-between gap-2 text-[12.5px] opacity-50">
                            <span>
                              {idle.length} {hy.owner.daysShort} ·{' '}
                              {idle.reduce((s, d) => s + d.count, 0)} {tenant.unitOne}
                            </span>
                            <span>{money(0)}</span>
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {r.staffId && r.earned > 0 && (
                    <div className="mt-3.5">
                      <PayButton staffId={r.staffId} label={hy.owner.markPaid} />
                    </div>
                  )}
                </PersonTile>
              ))}
            </div>
          )}
        </div>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          {/* Сколько всего раздать сейчас — то, с чем сюда заходят.
              Раньше владелец складывал строки в уме. */}
          <Panel>
            <Reading
              caption={`${hy.owner.sinceLastPayout} · ${money(revenue)}`}
              value={money(due)}
            />
          </Panel>

          {history.length > 0 && (
            <Panel title={hy.owner.payoutHistory} count={history.length}>
              <div className="board-journal">
                {history.map((p) => (
                  <Row key={p.id}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ background: personColor(p.staffName) }}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[15px] font-semibold"
                      style={{ color: 'var(--on-board)' }}
                    >
                      {p.staffName ?? '—'}
                    </span>
                    <span
                      className="num shrink-0 text-[12px]"
                      style={{ color: 'var(--board-muted)' }}
                    >
                      {p.periodFrom.getTime() > 0
                        ? `${shortDate(p.periodFrom)} — ${shortDate(p.periodTo)}`
                        : `${hy.owner.upTo} ${shortDate(p.periodTo)}`}
                    </span>
                    <span
                      className="num shrink-0 text-right text-[15px] font-semibold"
                      style={{ color: 'var(--on-board)' }}
                    >
                      {money(p.amount)}
                    </span>
                  </Row>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/** `2026-08-10` → `10.08`. Год не показываем: неоплаченное за год —
    не тот случай, ради которого стоит занимать место в строке. */
function dayLabel(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}.${m}`;
}

/** Дата без локали: Intl расходится между сервером и браузером. */
function shortDate(d?: Date | null): string {
  if (!d || d.getTime() <= 0) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}
