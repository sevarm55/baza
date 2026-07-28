import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Hero } from '@/components/stat';

/** Через сколько дней молчания клиент считается потерянным. */
const LOST_AFTER_DAYS = 21;

export default async function ClientsPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const money = (n: number) => formatMoney(n, tenant.currency);

  const now = Date.now();
  const withAge = clients.map((c) => ({
    ...c,
    days: Math.floor((now - c.lastSeenAt.getTime()) / 86_400_000),
  }));

  const lost = withAge.filter((c) => c.days > LOST_AFTER_DAYS);
  const loyal = withAge.filter((c) => c.visits > 1);
  const avg = clients.length
    ? Math.round(clients.reduce((s, c) => s + c.total, 0) / clients.length)
    : 0;

  return (
    <>
      <Hero
        label={hy.owner.clientsTotal}
        value={String(clients.length)}
        tone="ink"
        meta={
          <>
            {loyal.length} {hy.owner.clientsLoyal.toLowerCase()} · {hy.owner.clientsAvg}{' '}
            {money(avg)}
          </>
        }
      />

      {/* Пропавшие — единственная часть экрана, с которой можно что-то
          сделать прямо сейчас. Поэтому они выше общего списка, а не в нём. */}
      {lost.length > 0 && (
        <section className="mb-5">
          <h2 className="h-section !mt-0 flex items-baseline gap-2">
            <span className="text-warn">{hy.owner.clientsLost}</span>
            <span className="num text-warn">{lost.length}</span>
            <span className="ms-auto font-normal normal-case tracking-normal">
              {hy.owner.comeBack}
            </span>
          </h2>
          <div className="list">
            {lost.slice(0, 10).map((c) => (
              <div key={c.id} className="li">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-warn-bg text-warn-ink">
                  💤
                </div>
                <div className="min-w-0 flex-1">
                  <div className="num truncate text-[14.5px] font-semibold">{c.key}</div>
                  <div className="num text-[12.5px] text-muted">
                    {c.visits} {hy.owner.visits} · {money(c.total)}
                  </div>
                </div>
                <span className="num shrink-0 rounded-full bg-warn-bg px-2.5 py-1 text-xs font-semibold text-warn-ink">
                  {hy.owner.lostFor(c.days)}
                </span>
              </div>
            ))}
          </div>
          {lost.length > 10 && (
            <p className="mt-2 px-1 text-[12.5px] text-faint">
              {hy.owner.clientsLostNote(lost.length)}
            </p>
          )}
        </section>
      )}

      <h2 className="h-section !mt-0">{hy.owner.allClients}</h2>
      <div className="list">
        {withAge.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-faint">{hy.common.empty}</div>
        ) : (
          withAge.map((c) => (
            <div key={c.id} className="li">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2 text-muted">
                {c.visits > 1 ? '★' : '·'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="num truncate text-[14.5px] font-semibold">{c.key}</div>
                <div className="num text-[12.5px] text-muted">
                  {c.visits} {hy.owner.visits} · {money(c.total)}
                </div>
              </div>
              <div className="num shrink-0 text-right text-xs text-faint">
                {c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
