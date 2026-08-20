import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getClientHistory, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { Figures, Panel, Plate } from '@/components/board';
import { EmptyState } from '@/components/empty-state';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { formatPhone } from '@/lib/phone';
import { dayMonth, hhmm } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';

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
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса — на языке того, кто смотрит. Переводятся только
     заводские: своё название владельца проходит насквозь (см. terms.ts).
     Копия уходит ТОЛЬКО на экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const { key } = await params;
  const found = await getClientHistory(tenant.id, decodeURIComponent(key));
  if (!found) notFound();

  const { client } = found;
  /* Названия услуг в истории машины — на языке того, кто смотрит.
     Переводится только заводское, своё название владельца проходит
     насквозь (см. terms.ts). */
  const orders = found.orders.map((o) => ({
    ...o,
    serviceName: serviceNameTerm(o.serviceName, t.locale),
  }));
  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const days = client.daysSince;
  const avg = client.visits > 0 ? Math.round(client.total / client.visits) : 0;
  const lost = days > LOST_AFTER_DAYS;
  const last = days === 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(days);

  const longDay = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tenant.timezone,
  });

  const service = topOf(orders.map((o) => o.serviceName));
  /* Кто чаще мыл эту машину. Считаем по участникам, а не по
     авторам записей: совместную мойку записывает один, а работают все,
     и «чаще всего мыл Арман» по авторству назвало бы того, у кого
     телефон под рукой. */
  const staff = topOf(
    orders.flatMap((o) =>
      o.crew.length > 0
        ? o.crew.map((p) => p.name).filter((n): n is string => Boolean(n))
        : o.staffName
          ? [o.staffName]
          : [],
    ),
  );
  const payment = topOf(orders.map((o) => paymentLabel(o.payment, t)));

  return (
    <>
      <PageHead
        title={client.key}
        meta={
          /* Только на компьютере: на телефоне ровно та же стрелка стоит
             в шапке экрана, и вторая под ней спрашивала бы, чем они
             отличаются. */
          <Link
            href="/owner/clients"
            className="hidden md:inline"
            style={{ color: 'var(--board-muted)' }}
          >
            ← {t.owner.tabClients}
          </Link>
        }
      >
        {client.phone && (
          <div className="flex flex-wrap items-center gap-2">
            <a className="btn-inline btn-inline-primary" href={`tel:${client.phone}`}>
              {t.owner.clientCall}
            </a>
            <a className="btn-inline" href={`sms:${client.phone}`}>
              {t.owner.clientWrite}
            </a>
          </div>
        )}
      </PageHead>

      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={t.owner.clientsTotalSpent}
      >
        <Plate
          label={t.owner.clientsTotalSpent}
          value={money(client.total)}
          note={contactLine(client.name, client.phone) || undefined}
        />

        <Figures
          items={[
            { label: t.owner.visits, value: String(client.visits) },
            { label: t.owner.clientAvg, value: money(avg) },
            { label: t.owner.lastVisit, value: last },
          ]}
        />
      </section>

      {/* Пропавшему — строкой у показаний, а не плашкой во всю ширину:
          это повод позвонить, а не тревога. */}
      {lost && <p className="signal mt-3.5">{t.owner.clientLostHint}</p>}

      <div className="mt-[var(--seam)] grid gap-[var(--seam)]">
        {orders.length > 0 && (
          <Panel title={t.owner.clientHabits}>
            <dl className="facts">
              <div>
                <dt>{t.owner.clientFirstVisit}</dt>
                <dd className="num">{longDay.format(client.firstSeenAt)}</dd>
              </div>
              {service && (
                <div>
                  <dt>{t.owner.clientOftenTakes}</dt>
                  <dd className="truncate">{service}</dd>
                </div>
              )}
              {payment && (
                <div>
                  <dt>{t.owner.clientOftenPays}</dt>
                  <dd>{payment}</dd>
                </div>
              )}
              {staff && (
                <div>
                  <dt>{t.owner.clientOftenServed}</dt>
                  <dd className="truncate">{staff}</dd>
                </div>
              )}
            </dl>
          </Panel>
        )}

        <Panel title={t.owner.clientHistory} count={orders.length}>
          {orders.length === 0 ? (
            <EmptyState title={t.common.empty} />
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
                          style={{ background: personColor(o.crew[0]?.name ?? o.staffName) }}
                          aria-hidden
                        />
                        {crewNames(o)} · {paymentLabel(o.payment, t)} ·{' '}
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
                    <th>{t.owner.colService}</th>
                    <th>{tenant.staffRole}</th>
                    <th>{t.owner.colPayment}</th>
                    <th className="end">{t.owner.colPrice}</th>
                    <th className="end">{t.owner.colTime}</th>
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
                            style={{ background: personColor(o.crew[0]?.name ?? o.staffName) }}
                            aria-hidden
                          />
                          <span className="truncate">{crewNames(o)}</span>
                        </span>
                      </td>
                      <td>
                        <span className="tag">{paymentLabel(o.payment, t)}</span>
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

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}

/**
 * Кто мыл — одной строкой.
 *
 * Все участники, а не автор записи: совместную мойку вносит один
 * человек, а работают несколько, и назвать одного значило бы соврать про
 * остальных. У одиночной записи участник ровно один, и строка выглядит
 * ровно как выглядела.
 */
function crewNames(order: { crew: { name: string | null }[]; staffName: string | null }): string {
  const names = order.crew.map((p) => p.name).filter((n): n is string => Boolean(n));
  if (names.length > 0) return names.join(' · ');
  return order.staffName ?? '—';
}
