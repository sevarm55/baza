import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import { getTenant, listClients } from '@/lib/queries';
import { formatMoney } from '@/lib/money';
import { LOST_AFTER_DAYS } from '@/lib/alerts';
import { Figures, Plate } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { ClientsWorkspace } from './workspace';
import type { ClientGroup, ClientRow } from './model';
import { getDict } from '@/lib/i18n/server';

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
  const t = await getDict();
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const clients = await listClients(tenant.id);
  const asked = (await searchParams).group;
  const group: ClientGroup =
    asked === 'lost' || asked === 'loyal' || asked === 'fresh' ? asked : 'all';

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);

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
    <>
      {/* Повод «давно не были» ушёл отсюда, и по той же причине, что долг
          с сотрудников: он висел у заголовка строкой тревожного цвета, а
          прямо под ним стоит вкладка с тем же словом и тем же числом —
          и она вдобавок показывает, КТО именно давно не был. Строка
          наверху только называла беду и никуда не вела глазами. */}
      <PageHead title={t.owner.tabClients} meta={t.owner.clientsLead} />

      {/* Полоса отвечает про ДЕНЬГИ, а не про состав базы.

          Раньше в ней стояли «в базе», «постоянные» и «давно не были» —
          ровно те же три числа, что стоят на вкладках строкой ниже. Там
          они вдобавок нажимаются и показывают список, здесь только
          назывались; из четырёх сегментов базы полоса при этом знала
          три, то есть ещё и врала про полноту.

          Теперь плита говорит, сколько база принесла за всё время, а
          полоса — из чего эта сумма набежала: сколько было приездов, по
          какому чеку и сколько выходит с одного клиента. Ни одно из
          этих чисел ниже не повторяется. */}
      <section
        className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]"
        aria-label={t.owner.clientsLifetime}
      >
        <Plate
          label={t.owner.clientsLifetime}
          value={money(lifetime)}
          note={rows.length > 0 ? `${rows.length} ${t.owner.clientOne}` : undefined}
        />

        <Figures
          items={[
            { label: t.owner.visits, value: String(visits) },
            { label: t.owner.avgCheck, value: money(perVisit) },
            { label: t.owner.clientPerOne, value: money(avg) },
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
