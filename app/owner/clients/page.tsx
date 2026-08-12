import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { ClientsTable, type ClientRow } from './clients-table';

/** Через сколько дней молчания клиент считается потерянным. */
const LOST_AFTER_DAYS = 21;

/**
 * База клиентов.
 *
 * Пересобрана по тем же правилам, что сводка и зарплаты, и заодно
 * догнала приложение: поиск по номеру, три порядка, история одной
 * машины по нажатию.
 *
 * Показание «сколько у меня клиентов» убрано. Оно занимало треть экрана
 * и повторялось ещё дважды — в подписи списка и в его счётчике; при этом
 * вопрос, с которым сюда заходят, другой: найти конкретную машину или
 * понять, кому позвонить. Число осталось строкой в полосе.
 */
export default async function ClientsPage({
  searchParams,
}: {
  /* Колокольчик приводит сюда с уже выбранной группой: повод «пятеро
     давно не были» обязан открыть именно этих пятерых, а не список из
     двухсот, в котором их надо искать. */
  searchParams: Promise<{ group?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const asked = (await searchParams).group;
  const initialGroup = asked === 'lost' || asked === 'loyal' || asked === 'all' ? asked : null;

  /* Дни молчания приходят из базы: часы читает она, а не страница —
     иначе число на сервере и в браузере разъезжается. */
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    key: c.key,
    name: c.name,
    phone: c.phone,
    visits: c.visits,
    total: c.total,
    days: c.daysSince,
  }));

  return (
    <>
      <PageHead title={hy.owner.tabClients} />

      {/* Полоса переехала внутрь таблицы: по её плиткам теперь
          нажимают, а нажатие — это состояние, которого у серверной
          страницы нет. Числа те же и считаются там же. */}
      <div>
        <Panel title={hy.owner.allClients} count={rows.length}>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
              {hy.common.empty}
            </p>
          ) : (
            <ClientsTable
              initialGroup={initialGroup}
              rows={rows}
              lostAfter={LOST_AFTER_DAYS}
              currency={tenant.currency}
              unit={hy.owner.tabClients}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
