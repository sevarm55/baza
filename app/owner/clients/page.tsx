import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Stat, StatGrid } from '@/components/stat';

/** Через сколько дней молчания клиент считается потерянным. */
const LOST_AFTER_DAYS = 21;

export default async function ClientsPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/login');

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
      <StatGrid>
        <Stat label={hy.owner.clientsTotal} value={clients.length} />
        <Stat label={hy.owner.clientsLoyal} value={loyal.length} tone="good" />
        <Stat label={hy.owner.clientsLost} value={lost.length} tone="warn" />
        <Stat label={hy.owner.clientsAvg} value={money(avg)} />
      </StatGrid>

      <div className="list">
        {withAge.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted">{hy.common.empty}</div>
        ) : (
          withAge.map((c) => {
            const away = c.days > LOST_AFTER_DAYS;
            return (
              <div key={c.id} className="li">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-surface2">
                  {away ? '💤' : '👤'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{c.key}</div>
                  <div className="text-[12.5px] text-muted">
                    {c.visits} {hy.owner.visits} · {money(c.total)}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {away ? (
                    <span className="rounded-full bg-[#3a2a10] px-2 py-0.5 font-semibold text-warn">
                      {hy.owner.lostFor(c.days)}
                    </span>
                  ) : (
                    <span className="text-muted">
                      {c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {lost.length > 0 && (
        <p className="mt-3.5 rounded-[14px] border-l-[3px] border-warn bg-surface p-3.5 text-[13px] leading-relaxed text-muted">
          {hy.owner.clientsLostNote(lost.length)}
        </p>
      )}
    </>
  );
}
