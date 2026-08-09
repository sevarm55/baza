import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Hero } from '@/components/stat';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';

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
      <PageHead title={hy.owner.tabClients} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <Panel title={hy.owner.allClients} count={withAge.length} className="lg:col-span-8">
          {withAge.length === 0 ? (
            <p className="py-10 text-center text-sm text-faint">{hy.common.empty}</p>
          ) : (
            <>
              {/* На телефоне — карточки: строка из пяти столбцов туда не
                  влезает. На компьютере — таблица: клиентов сотни, и
                  сравнить их можно только столбцом. */}
              <div className="grid gap-2 lg:hidden">
                {withAge.map((c) => (
                  <ClientCard
                    key={c.id}
                    plate={c.key}
                    meta={`${c.visits} ${hy.owner.visits} · ${money(c.total)}`}
                    loyal={c.visits > 1}
                    mark={c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
                    tone={c.days > LOST_AFTER_DAYS ? 'warn' : undefined}
                  />
                ))}
              </div>

              <div className="hidden lg:block">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{hy.owner.tabClients}</th>
                      <th className="end">{hy.owner.visits}</th>
                      <th className="end">{hy.owner.clientsTotalSpent}</th>
                      <th className="end">{hy.owner.lastVisit}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {withAge.map((c) => {
                      const gone = c.days > LOST_AFTER_DAYS;
                      return (
                        <tr key={c.id}>
                          <td>
                            <span className="num text-[15px] font-bold tracking-wide">
                              {c.key}
                            </span>
                            {c.visits > 1 && (
                              <span
                                className="ms-2 rounded-[4px] px-1.5 py-0.5 text-[12px] font-semibold"
                                style={{
                                  background: 'var(--good-bg)',
                                  color: 'var(--good-ink)',
                                }}
                              >
                                {hy.owner.clientsLoyal}
                              </span>
                            )}
                          </td>
                          <td className="num end" style={{ color: 'var(--board-muted)' }}>
                            {c.visits}
                          </td>
                          <td className="num end font-semibold">{money(c.total)}</td>
                          <td
                            className="num end"
                            style={{
                              color: gone ? 'var(--warn-on-board)' : 'var(--board-muted)',
                              fontWeight: gone ? 600 : undefined,
                            }}
                          >
                            {c.days === 0
                              ? hy.owner.lastVisitToday
                              : hy.owner.lastVisitAgo(c.days)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-4 lg:order-first">
          <Panel>
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
          </Panel>

          {/* Пропавшие — единственная часть экрана, с которой можно
              что-то сделать прямо сейчас. Поэтому они отдельным
              прибором, а не строками среди всех остальных. */}
          {lost.length > 0 && (
            <Panel
              title={hy.owner.clientsLost}
              count={lost.length}
              actions={
                <span className="text-[13.5px]" style={{ color: 'var(--warn-on-board)' }}>
                  {hy.owner.comeBack}
                </span>
              }
            >
              <div className="board-journal">
                {lost.slice(0, 12).map((c) => (
                  <div key={c.id} className="flex items-baseline gap-3 px-1.5 py-2">
                    <span className="num flex-1 truncate text-[15px] font-bold tracking-wide">
                      {c.key}
                    </span>
                    <span className="num text-[12px]" style={{ color: 'var(--board-muted)' }}>
                      {money(c.total)}
                    </span>
                    <span
                      className="num text-[12px] font-semibold"
                      style={{ color: 'var(--warn-on-board)' }}
                    >
                      {hy.owner.lostFor(c.days)}
                    </span>
                  </div>
                ))}
              </div>
              <p className="mt-2.5 text-[13.5px] text-faint">
                {hy.owner.clientsLostNote(lost.length)}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

/**
 * Клиент одной карточкой.
 *
 * Раньше слева стоял квадрат со звездой или точкой. Точка не значила
 * ничего, звезда значила «постоянный» — но об этом надо было догадаться.
 * Теперь то же самое сказано словом, и только там, где это правда;
 * у остальных строка просто короче.
 *
 * Номер — единственное, по чему владелец узнаёт клиента, поэтому он
 * набран крупно и первым, а не мельче даты последнего визита.
 */
function ClientCard({
  plate,
  meta,
  loyal,
  mark,
  tone,
}: {
  plate: string;
  meta: string;
  loyal: boolean;
  mark: string;
  tone?: 'warn';
}) {
  return (
    <div
      className={`tile flex items-center gap-3 ${
        tone === 'warn' ? '!border-warn-line !bg-warn-bg' : ''
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="num truncate text-[17px] leading-tight font-bold tracking-wide">
          {plate}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          {loyal && (
            <span className="rounded-[4px] bg-good-bg px-1.5 py-0.5 text-[12px] font-semibold text-good-ink">
              {hy.owner.clientsLoyal}
            </span>
          )}
          <span className="num text-[13.5px] text-muted">{meta}</span>
        </div>
      </div>

      <span
        className={`num shrink-0 text-right text-[13.5px] ${
          tone === 'warn' ? 'font-semibold text-warn-ink' : 'text-faint'
        }`}
      >
        {mark}
      </span>
    </div>
  );
}
