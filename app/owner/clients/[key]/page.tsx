import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getClientHistory, getTenant } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { dayMonth, hhmm } from '@/lib/time';

/**
 * История одной машины.
 *
 * Список клиентов отвечает «кто это и сколько принёс». Следующий вопрос
 * владельца всегда один и тот же: что именно он у меня брал — и без
 * ответа строка списка тупик, а список превращается в счётчик, по
 * которому ничего нельзя решить.
 *
 * Отдельная страница, а не окно: на неё ссылаются, её открывают из
 * ленты и из поиска, и адрес с номером машины — сам по себе полезная
 * вещь. В приложении то же самое сделано листом, потому что там некуда
 * ссылаться.
 *
 * Отменённых записей здесь нет: клиент за них не платил, и в его итоге
 * их нет — покажи мы их, сумма в шапке перестала бы сходиться с лентой
 * под ней.
 */
export default async function ClientPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
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
      />

      <FlowStrip
        links={[
          { label: hy.owner.visits, value: String(client.visits) },
          { label: hy.owner.clientAvg, value: money(avg) },
          {
            label: hy.owner.lastVisit,
            value: days === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(days),
          },
          { label: hy.owner.clientsTotalSpent, value: money(client.total), strong: true },
        ]}
      />

      <div className="mt-[var(--seam)]">
        <Panel title={hy.owner.clientHistory} count={orders.length}>
          {orders.length === 0 ? (
            <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
              {hy.common.empty}
            </p>
          ) : (
            <table className="tbl">
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
                      {dayMonth(o.createdAt, tenant.timezone)} · {hhmm(o.createdAt, tenant.timezone)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
