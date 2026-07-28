import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getSettledUntil, getTenant, getUnsettledPayroll, listPayouts } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Avatar, Hero } from '@/components/stat';
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
      <Hero
        label={hy.owner.payrollDue}
        value={money(due)}
        meta={`${hy.owner.sinceLastPayout} · ${money(revenue)}`}
      />

      <div className="list">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{hy.owner.nothingDue}</div>
        ) : (
          rows.map((r) => (
            <div key={r.staffId ?? 'none'} className="li">
              <Avatar text={r.name ?? '—'} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-semibold">{r.name ?? '—'}</div>
                <div className="text-[12.5px] text-muted">
                  {r.count} {tenant.unitOne} · {money(r.revenue)} · {hy.owner.rate}{' '}
                  {r.percent ?? 0}%
                </div>
                {/* показываем только если расчёт уже был — иначе строка пустая */}
                {settled.has(r.staffId ?? '') && (
                  <div className="text-[11.5px] text-muted">
                    {hy.owner.sinceLastPayout}: {shortDate(settled.get(r.staffId ?? ''))}
                  </div>
                )}
              </div>
              <div className="shrink-0 text-right">
                <div className="mb-1 text-[14.5px] font-semibold text-good">
                  {money(r.earned)}
                </div>
                {r.staffId && r.earned > 0 && (
                  <PayButton staffId={r.staffId} label={hy.owner.markPaid} />
                )}
              </div>
            </div>
          ))
        )}
      </div>

      <p className="note mt-3.5">
        {hy.owner.payrollNote}
      </p>

      {history.length > 0 && (
        <>
          <h2 className="h-section">{hy.owner.payoutHistory}</h2>
          <div className="list">
            {history.map((p) => (
              <div key={p.id} className="li">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">
                    {p.staffName ?? '—'}
                  </div>
                  <div className="text-[12.5px] text-muted">
                    {/* первый расчёт охватывает всё с самого начала,
                        и «— — 26.07» читается как ошибка */}
                    {p.periodFrom.getTime() > 0
                      ? `${shortDate(p.periodFrom)} — ${shortDate(p.periodTo)}`
                      : `${hy.owner.upTo} ${shortDate(p.periodTo)}`}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-[14.5px] font-semibold">{money(p.amount)}</div>
                  <div className="text-xs text-muted">
                    {hy.owner.paidOn} {shortDate(p.paidAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
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
