import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { Panel } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
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
export default async function ClientsPage() {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const money = (n: number) => formatMoney(n, tenant.currency);

  /* Дни молчания приходят из базы: часы читает она, а не страница —
     иначе число на сервере и в браузере разъезжается. */
  const rows: ClientRow[] = clients.map((c) => ({
    id: c.id,
    key: c.key,
    visits: c.visits,
    total: c.total,
    days: c.daysSince,
  }));

  const lost = rows.filter((c) => c.days > LOST_AFTER_DAYS);
  const loyal = rows.filter((c) => c.visits > 1);
  const avg = rows.length ? Math.round(rows.reduce((s, c) => s + c.total, 0) / rows.length) : 0;

  /* Суммы форматирует сервер: валюта и разряды — свойство бизнеса, и
     решаться они должны там, где бизнес известен, а не в браузере. */
  const formatted = Object.fromEntries(rows.map((c) => [c.id, money(c.total)]));

  return (
    <>
      <PageHead title={hy.owner.tabClients} />

      {/* Знаков между звеньями нет: это не цепочка вычетов, а четыре
          независимых ответа. Выделен последний — пропавшие: единственное
          на экране, с чем можно что-то сделать прямо сейчас. */}
      <FlowStrip
        links={[
          { label: hy.owner.clientsTotal, value: String(rows.length) },
          { label: hy.owner.clientsLoyal, value: String(loyal.length) },
          { label: hy.owner.clientsAvg, value: money(avg) },
          {
            label: hy.owner.clientsLost,
            value: String(lost.length),
            /* Выделяем, только когда есть кого возвращать. Белая плита
               с нулём тянет взгляд к тому, чего нет, и обесценивает
               выделение там, где оно однажды понадобится. */
            strong: lost.length > 0,
            note: lost.length > 0 ? hy.owner.comeBack : undefined,
          },
        ]}
      />

      <div className="mt-[var(--seam)]">
        <Panel title={hy.owner.allClients} count={rows.length}>
          {rows.length === 0 ? (
            <p className="py-10 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
              {hy.common.empty}
            </p>
          ) : (
            <ClientsTable
              rows={rows}
              lostAfter={LOST_AFTER_DAYS}
              money={formatted}
              unit={hy.owner.tabClients}
            />
          )}
        </Panel>
      </div>
    </>
  );
}
