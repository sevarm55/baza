import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getSettledUntil, getTenant, getUnsettledPayroll, listPayouts } from '@/lib/queries';
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

  const [rows, settled, history] = await Promise.all([
    getUnsettledPayroll(tenant.id),
    getSettledUntil(tenant.id),
    listPayouts(tenant.id),
  ]);

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
                          отдать деньги. */}
                      <div className="num text-[12px] opacity-75">
                        {r.count} {tenant.unitOne} · {money(r.revenue)} · {r.percent ?? 0}%
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

/** Дата без локали: Intl расходится между сервером и браузером. */
function shortDate(d?: Date | null): string {
  if (!d || d.getTime() <= 0) return '—';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}`;
}
