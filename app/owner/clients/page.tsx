import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { Figures, Plate } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { ClientsWorkspace } from './workspace';
import type { ClientGroup, ClientRow } from './model';

/**
 * Клиентская база.
 *
 * Страница отвечает на один вопрос: кто приносит выручку. И отвечает в
 * том порядке, в каком его задают:
 *
 *   1. сколько база принесла всего  → плита наверху;
 *   2. сколько их и кто возвращается → три числа рядом с ней;
 *   3. кто именно                    → отбор и список;
 *   4. что он у меня брал            → карточка машины.
 *
 * Клиент здесь — это машина, а не человек: при записи мойщик вводит
 * номер, и по нему же машина узнаётся в следующий раз. Имя и телефон
 * появляются позже, из карточки. Придумывать поверх этого «человека с
 * несколькими автомобилями» было бы враньём в модели — продукт такой
 * связи не хранит.
 *
 * Порог «давно не был» берётся из `lib/alerts`, а не задаётся здесь.
 * Раньше это была своя константа с тем же числом; два порога на одно
 * состояние держатся согласованными ровно до первой правки, после
 * которой колокольчик зовёт звонить пятерым, а список показывает
 * троих.
 */
export default async function ClientsPage({
  searchParams,
}: {
  /* Колокольчик и полоса показаний приводят сюда с уже выбранной
     группой: повод «пятеро давно не были» обязан открыть именно этих
     пятерых, а не список из двухсот, в котором их надо искать. */
  searchParams: Promise<{ group?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const asked = (await searchParams).group;
  const group: ClientGroup =
    asked === 'lost' || asked === 'loyal' || asked === 'fresh' ? asked : 'all';

  const money = (n: number) => formatMoney(n, tenant.currency);

  /* Дни молчания приходят из базы: часы читает она, а не страница —
     иначе число на сервере и в браузере разъезжается. */
  /* Дни молчания приходят из базы уже обрезанными нулём: часы читает
     она, а не страница, и обрезает она же — приложение получает то же
     число тем же запросом, и «был −1 день назад» не может появиться ни
     на одном из двух экранов. */
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    phone: c.phone,
    visits: c.visits,
    total: c.total,
    days: c.daysSince,
    last: c.daysSince === 0 ? hy.owner.lastVisitToday : hy.owner.lastVisitAgo(c.daysSince),
    avg: c.visits > 0 ? Math.round(c.total / c.visits) : 0,
  }));

  const loyal = rows.filter((c) => c.visits > 1).length;
  const lost = rows.filter((c) => c.days > LOST_AFTER_DAYS).length;
  const lifetime = rows.reduce((sum, c) => sum + c.total, 0);
  const avg = rows.length > 0 ? Math.round(lifetime / rows.length) : 0;

  return (
    <>
      <PageHead title={hy.owner.tabClients} meta={hy.owner.clientsLead}>
        {/* Повод — строкой у заголовка, тем же приёмом, что «пора
            платить» на зарплатах: это подсказка, а не показание, и
            занимать ею первый экран незачем. */}
        {lost > 0 && (
          <Link className="signal" href="/owner/clients?group=lost">
            {hy.alerts.lostTitle(lost)}
          </Link>
        )}
      </PageHead>

      {/* Полоса показаний, а не четыре карточки: числа здесь справочные,
          и единственное, ради чего базу открывают деньгами, — сколько
          она принесла за всё время. Оно и стоит плитой. */}
      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={hy.owner.clientsLifetime}
      >
        <Plate
          label={hy.owner.clientsLifetime}
          value={money(lifetime)}
          note={
            rows.length > 0
              ? `${rows.length} ${hy.owner.clientOne} · ${hy.owner.clientAvg} ${money(avg)}`
              : undefined
          }
        />

        <Figures
          items={[
            { label: hy.owner.clientsTotal, value: String(rows.length) },
            {
              label: hy.owner.clientsLoyal,
              value: String(loyal),
              href: loyal > 0 ? '/owner/clients?group=loyal' : undefined,
            },
            {
              label: hy.owner.clientsLost,
              value: String(lost),
              href: lost > 0 ? '/owner/clients?group=lost' : undefined,
            },
          ]}
        />
      </section>

      <div className="mt-[var(--seam)]">
        <ClientsWorkspace
          rows={rows}
          initialGroup={group}
          lostAfter={LOST_AFTER_DAYS}
          currency={tenant.currency}
        />
      </div>
    </>
  );
}
