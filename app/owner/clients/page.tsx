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
          <div className="grid gap-2">
            {lost.slice(0, 10).map((c) => (
              <ClientCard
                key={c.id}
                plate={c.key}
                meta={`${c.visits} ${hy.owner.visits} · ${money(c.total)}`}
                loyal={c.visits > 1}
                mark={hy.owner.lostFor(c.days)}
                tone="warn"
              />
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
      {withAge.length === 0 ? (
        <div className="tile px-4 py-12 text-center text-sm text-faint">
          {hy.common.empty}
        </div>
      ) : (
        <div className="grid gap-2">
          {withAge.map((c) => (
            <ClientCard
              key={c.id}
              plate={c.key}
              meta={`${c.visits} ${hy.owner.visits} · ${money(c.total)}`}
              loyal={c.visits > 1}
              mark={c.days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.days)}
            />
          ))}
        </div>
      )}
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
            <span className="rounded-full bg-good-bg px-2 py-0.5 text-[11px] font-semibold text-good-ink">
              {hy.owner.clientsLoyal}
            </span>
          )}
          <span className="num text-[12.5px] text-muted">{meta}</span>
        </div>
      </div>

      <span
        className={`num shrink-0 text-right text-[12.5px] ${
          tone === 'warn' ? 'font-semibold text-warn-ink' : 'text-faint'
        }`}
      >
        {mark}
      </span>
    </div>
  );
}
