import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getClientHistory, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { Figures, Panel, Plate } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { formatPhone } from '@/lib/phone';
import { dayMonth, hhmm } from '@/lib/time';

/**
 * История одной машины — отдельной страницей.
 *
 * Внутри списка ту же историю показывает выдвижная панель: она не
 * уводит со страницы и не теряет набранный поиск. Эта страница — путь
 * СНАРУЖИ: на неё ссылаются, её открывают из ленты и из адреса, и адрес
 * с номером машины сам по себе полезная вещь.
 *
 * Обе считают одно и то же одной функцией и отвечают одними и теми же
 * словами. Расходись они хоть в одном числе — и владелец, открывший
 * машину двумя способами, перестал бы верить обоим.
 *
 * Отменённых записей здесь нет: клиент за них не платил, и в его итоге
 * их нет — покажи мы их, сумма в шапке перестала бы сходиться с лентой
 * под ней.
 */
export default async function ClientPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { key } = await params;
  const found = await getClientHistory(tenant.id, decodeURIComponent(key));
  if (!found) notFound();

  const { client, orders } = found;
  const money = (n: number) => formatMoney(n, tenant.currency);
  const days = client.daysSince;
  const avg = client.visits > 0 ? Math.round(client.total / client.visits) : 0;
  const lost = days > LOST_AFTER_DAYS;
  const last = days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(days);

  const longDay = new Intl.DateTimeFormat('hy-AM', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tenant.timezone,
  });

  const service = topOf(orders.map((o) => o.serviceName));
  const staff = topOf(orders.map((o) => o.staffName).filter((n): n is string => Boolean(n)));
  const payment = topOf(orders.map((o) => paymentLabel(o.payment)));

  return (
    <>
      <PageHead
        title={client.key}
        standalone
        meta={
          <Link href="/owner/clients" style={{ color: 'var(--board-muted)' }}>
            ← {hy.owner.tabClients}
          </Link>
        }
      >
        {client.phone && (
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn-inline btn-inline-primary" href={`tel:${client.phone}`}>
              {hy.owner.clientCall}
            </a>
            <a className="btn-inline" href={`sms:${client.phone}`}>
              {hy.owner.clientWrite}
            </a>
          </div>
        )}
      </PageHead>

      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={hy.owner.clientsTotalSpent}
      >
        <Plate
          label={hy.owner.clientsTotalSpent}
          value={money(client.total)}
          note={contactLine(client.name, client.phone) || undefined}
        />

        <Figures
          items={[
            { label: hy.owner.visits, value: String(client.visits) },
            { label: hy.owner.clientAvg, value: money(avg) },
            { label: hy.owner.lastVisit, value: last },
          ]}
        />
      </section>

      {/* Пропавшему — строкой у показаний, а не плашкой во всю ширину:
          это повод позвонить, а не тревога. */}
      {lost && <p className="signal mt-3.5">{hy.owner.clientLostHint}</p>}

      <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
        {orders.length > 0 && (
          <Panel title={hy.owner.clientHabits}>
            <dl className="facts">
              <div>
                <dt>{hy.owner.clientFirstVisit}</dt>
                <dd className="num">{longDay.format(client.firstSeenAt)}</dd>
              </div>
              {service && (
                <div>
                  <dt>{hy.owner.clientOftenTakes}</dt>
                  <dd className="truncate">{service}</dd>
                </div>
              )}
              {payment && (
                <div>
                  <dt>{hy.owner.clientOftenPays}</dt>
                  <dd>{payment}</dd>
                </div>
              )}
              {staff && (
                <div>
                  <dt>{hy.owner.clientOftenServed}</dt>
                  <dd className="truncate">{staff}</dd>
                </div>
              )}
            </dl>
          </Panel>
        )}

        <Panel title={hy.owner.clientHistory} count={orders.length}>
          {orders.length === 0 ? (
            <EmptyState title={hy.common.empty} />
          ) : (
            <>
              {/* Телефон: строками, как и в списке клиентов. */}
              <div className="board-journal lg:hidden">
                {orders.map((o) => (
                  <div key={o.id} className="flex items-center gap-2.5 px-0.5 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold">
                        {o.serviceName}
                      </span>
                      <span
                        className="num flex items-center gap-1.5 truncate text-[12px]"
                        style={{ color: 'var(--board-muted)' }}
                      >
                        <span
                          className="size-1.5 shrink-0 rounded-full"
                          style={{ background: personColor(o.staffName) }}
                          aria-hidden
                        />
                        {o.staffName ?? '—'} · {paymentLabel(o.payment)} ·{' '}
                        {dayMonth(o.createdAt, tenant.timezone)}
                      </span>
                    </span>
                    <span className="num shrink-0 text-[14px] font-semibold">{money(o.price)}</span>
                  </div>
                ))}
              </div>

              <table className="tbl hidden lg:table">
                <thead>
                  <tr>
                    <th>{hy.owner.colService}</th>
                    <th>{tenant.staffRole}</th>
                    <th>{hy.owner.colPayment}</th>
                    <th className="end">{hy.owner.colPrice}</th>
                    <th className="end">{hy.owner.colTime}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td className="font-medium">{o.serviceName}</td>
                      <td>
                        <span className="flex items-center gap-2">
                          <span
                            className="size-2 shrink-0 rounded-full"
                            style={{ background: personColor(o.staffName) }}
                            aria-hidden
                          />
                          <span className="truncate">{o.staffName ?? '—'}</span>
                        </span>
                      </td>
                      <td>
                        <span className="tag">{paymentLabel(o.payment)}</span>
                      </td>
                      <td className="num end font-semibold">{money(o.price)}</td>
                      <td className="num end" style={{ color: 'var(--board-muted)' }}>
                        {dayMonth(o.createdAt, tenant.timezone)} ·{' '}
                        {hhmm(o.createdAt, tenant.timezone)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Panel>
      </div>
    </>
  );
}

/**
 * Что встречается чаще всего.
 *
 * Пусто, когда выбирать не из чего: «обычно берёт комплекс» после
 * единственного визита — это не привычка, а пересказ той же строки.
 */
function topOf(values: string[]): string | null {
  if (values.length < 2) return null;

  const count = new Map<string, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);

  const [best] = [...count.entries()].sort((a, b) => b[1] - a[1]);
  return best?.[0] ?? null;
}

function contactLine(name: string | null, phone: string | null): string {
  return [name, phone ? formatPhone(phone) : null].filter(Boolean).join(' · ');
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
