import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { getDict } from '@/lib/i18n/server';
import { PageHeader } from '@/components/patterns/page-header';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { ClientsWorkspace } from './workspace';
import type { ClientGroup, ClientRow } from './model';

/**
 * Клиентская база.
 *
 * Страница отвечает на один вопрос: кто приносит выручку. И отвечает в
 * том порядке, в каком его задают:
 *
 *   1. сколько база принесла всего  → первое показание полосы;
 *   2. сколько их и кто возвращается → три числа рядом;
 *   3. кто именно                    → отбор и список;
 *   4. что он у меня брал            → карточка машины.
 *
 * Клиент здесь — это машина, а не человек: при записи мойщик вводит
 * номер, и по нему же машина узнаётся в следующий раз. Имя и телефон
 * появляются позже, из карточки.
 *
 * Порог «давно не был» берётся из `lib/alerts`, а не задаётся здесь:
 * два порога на одно состояние держатся согласованными ровно до первой
 * правки, после которой колокольчик зовёт звонить пятерым, а список
 * показывает троих.
 */
export default async function ClientsPage({
  searchParams,
}: {
  /* Колокольчик и полоса показаний приводят сюда с уже выбранной
     группой: повод «пятеро давно не были» обязан открыть именно этих
     пятерых, а не список из двухсот, в котором их надо искать. */
  searchParams: Promise<{ group?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const asked = (await searchParams).group;
  const group: ClientGroup =
    asked === 'lost' || asked === 'loyal' || asked === 'fresh' ? asked : 'all';

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);

  /* Дни молчания приходят из базы уже обрезанными нулём: часы читает
     она, а не страница, и приложение получает то же число тем же
     запросом. */
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    phone: c.phone,
    visits: c.visits,
    total: c.total,
    days: c.daysSince,
    last: c.daysSince === 0 ? t.owner.lastVisitToday : t.owner.lastVisitAgo(c.daysSince),
    avg: c.visits > 0 ? Math.round(c.total / c.visits) : 0,
  }));

  const lifetime = rows.reduce((sum, c) => sum + c.total, 0);
  const visits = rows.reduce((sum, c) => sum + c.visits, 0);
  /* Средний чек базы — за ПРИЕЗД, а не за клиента: клиент, который был
     десять раз, оставляет десять чеков, и делить его сумму на единицу
     значило бы объявить его чек в десять раз больше настоящего. */
  const perVisit = visits > 0 ? Math.round(lifetime / visits) : 0;
  const avg = rows.length > 0 ? Math.round(lifetime / rows.length) : 0;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.owner.tabClients} description={t.owner.clientsLead} />

      {/* Полоса отвечает про деньги, а не про состав базы: состав стоит
          на вкладках ниже, и там он вдобавок нажимается. Здесь — сколько
          база принесла за всё время и из чего эта сумма набежала. */}
      <MetricStrip columns={4}>
        <Metric
          size="lg"
          label={t.owner.clientsLifetime}
          value={money(lifetime)}
          hint={rows.length > 0 ? `${rows.length} ${t.owner.clientOne}` : undefined}
        />
        <Metric label={t.owner.visits} value={String(visits)} />
        <Metric label={t.owner.avgCheck} value={money(perVisit)} />
        <Metric label={t.owner.clientPerOne} value={money(avg)} />
      </MetricStrip>

      <ClientsWorkspace
        rows={rows}
        initialGroup={group}
        lostAfter={LOST_AFTER_DAYS}
        currency={tenant.currency}
      />
    </div>
  );
}
