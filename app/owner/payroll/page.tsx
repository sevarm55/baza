import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getSettledUntil, getTenant, getUnsettledPayroll, listPayouts } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Journal, PersonTile, Reading, Row } from '@/components/board';
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

  return (
    <>
      {/* Сколько всего раздать сейчас — то, с чем сюда заходят. Раньше
          владелец складывал строки в уме. */}
      <Reading
        caption={`${hy.owner.sinceLastPayout} · ${money(revenue)}`}
        value={money(due)}
      />

      {rows.length === 0 ? (
        <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {hy.owner.nothingDue}
        </p>
      ) : (
        <div className="grid gap-2.5">
          {rows.map((r) => (
            <PersonTile key={r.staffId ?? 'none'} color={personColor(r.name)}>
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[16px] font-bold">{r.name ?? '—'}</div>
                  {/* Основание расчёта рядом с суммой, а не спрятано:
                      это то, чем владелец проверяет цифру, прежде чем
                      отдать деньги. */}
                  <div className="num text-[11.5px] opacity-75">
                    {r.count} {tenant.unitOne} · {money(r.revenue)} · {r.percent ?? 0}%
                  </div>
                  {settled.has(r.staffId ?? '') && (
                    <div className="num text-[11px] opacity-60">
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

      <p className="note mt-3.5">{hy.owner.payrollNote}</p>

      {history.length > 0 && (
        <Journal title={hy.owner.payoutHistory} count={history.length}>
          {history.map((p) => (
            <Row key={p.id}>
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: personColor(p.staffName) }}
              />
              <span
                className="min-w-0 flex-1 truncate text-[14px] font-semibold"
                style={{ color: 'var(--on-board)' }}
              >
                {p.staffName ?? '—'}
              </span>
              <span className="num shrink-0 text-[11.5px]" style={{ color: 'var(--board-muted)' }}>
                {p.periodFrom.getTime() > 0
                  ? `${shortDate(p.periodFrom)} — ${shortDate(p.periodTo)}`
                  : `${hy.owner.upTo} ${shortDate(p.periodTo)}`}
              </span>
              <span
                className="num shrink-0 text-right text-[14px] font-semibold"
                style={{ color: 'var(--on-board)' }}
              >
                {money(p.amount)}
              </span>
            </Row>
          ))}
        </Journal>
      )}
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
