import { and, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { compactClientKey } from './client-key';
import {
  accounts,
  clients,
  orderItems,
  orders,
  payouts,
  services,
  tenants,
  users,
} from './db/schema';
import { getPassSales } from './passes';

/* Все чтения идут отсюда и ВСЕГДА принимают tenantId первым аргументом.
   Запросов к db из компонентов быть не должно — иначе рано или поздно
   один забытый where покажет владельцу чужие деньги. */

/* ─────────────────── админка платформы ───────────────────
   Единственное место, где запрос НЕ ограничен одним бизнесом.
   Вызывать только после requirePlatformAdmin().                */

export type AdminTenant = Awaited<ReturnType<typeof listTenantsForAdmin>>[number];

/**
 * Несколько простых запросов вместо одного с коррелированными подзапросами.
 * Бизнесов десятки, разница в скорости незаметна, а читается и проверяется
 * это несравнимо легче — что для единственного места без scope по тенанту
 * важнее экономии на запросах.
 */
export async function listTenantsForAdmin() {
  const [list, owners, activity, staff] = await Promise.all([
    db.select().from(tenants).orderBy(desc(tenants.createdAt)),

    /* Номер берём у человека, а не из копии на участии: копия доживает
       свой век. Заодно приходит его id — по нему точки одного владельца
       собираются в группу, а не считаются разными клиентами. */
    db
      .select({
        tenantId: users.tenantId,
        name: users.name,
        phone: accounts.phone,
        accountId: users.accountId,
      })
      .from(users)
      .innerJoin(accounts, eq(accounts.id, users.accountId))
      .where(eq(users.role, 'owner')),

    db
      .select({
        tenantId: orders.tenantId,
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
        lastOrderAt: sql<string | null>`max(${orders.createdAt})`,
        /* Простой считает база, а не страница. Причина не в скорости:
           Date.now() в разметке — это чтение часов во время отрисовки, и
           у сервера с браузером они разные. Заодно исчезает целый класс
           расхождений «на экране 7 дней, в письме 8». */
        idleDays: sql<number>`floor(extract(epoch from (now() - max(${orders.createdAt}))) / 86400)::int`,
      })
      .from(orders)
      .where(isNull(orders.canceledAt))
      .groupBy(orders.tenantId),

    db
      .select({ tenantId: users.tenantId, count: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.active, true))
      .groupBy(users.tenantId),
  ]);

  const ownerBy = new Map(owners.map((o) => [o.tenantId, o]));
  const activityBy = new Map(activity.map((a) => [a.tenantId, a]));
  const staffBy = new Map(staff.map((s) => [s.tenantId, s.count]));

  return list.map((t) => {
    const a = activityBy.get(t.id);
    return {
      ...t,
      ownerName: ownerBy.get(t.id)?.name ?? null,
      ownerPhone: ownerBy.get(t.id)?.phone ?? null,
      ownerAccountId: ownerBy.get(t.id)?.accountId ?? null,
      staffCount: staffBy.get(t.id) ?? 0,
      orderCount: a?.orderCount ?? 0,
      idleDays: a?.idleDays ?? null,
      revenue: a?.revenue ?? 0,
      lastOrderAt: a?.lastOrderAt ? new Date(a.lastOrderAt) : null,
    };
  });
}

export async function getTenant(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return t ?? null;
}

/** Владелец бизнеса: тот, кому звонить. */
export async function getOwner(tenantId: string) {
  const [o] = await db
    .select({
      id: users.id,
      name: users.name,
      phone: accounts.phone,
      accountId: users.accountId,
    })
    .from(users)
    .innerJoin(accounts, eq(accounts.id, users.accountId))
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'owner')));
  return o ?? null;
}

/**
 * Остальные точки того же владельца — для карточки клиента.
 *
 * Разговор с клиентом почти всегда про все его мойки сразу: «продлите
 * мне» без уточнения, какую именно. Без списка это выясняется звонком.
 */
export async function otherPointsOf(accountId: string, exceptTenantId: string) {
  const rows = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      plan: tenants.plan,
      trialEndsAt: tenants.trialEndsAt,
      paidUntil: tenants.paidUntil,
    })
    .from(users)
    .innerJoin(tenants, eq(tenants.id, users.tenantId))
    .where(and(eq(users.accountId, accountId), eq(users.role, 'owner')))
    .orderBy(tenants.createdAt);

  return rows.filter((r) => r.id !== exceptTenantId);
}

export async function getUser(tenantId: string, userId: string) {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
  return u ?? null;
}

export async function listStaff(tenantId: string) {
  return db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.active, true)))
    .orderBy(users.name);
}

/**
 * Сколько раз услугу брали и сколько она принесла.
 *
 * Прейскурант сам по себе отвечает «сколько стоит» и молчит о том, что
 * из него берут. Владелец правит цену вслепую: поднять на комплексе,
 * который заказывают дважды в месяц, — это ничего; поднять на мойке
 * кузова, которых сорок шесть, — это другие деньги.
 *
 * Считаем по `service_id`, а не по названию: услугу переименовывают, и
 * записи со старым именем должны остаться при ней. Отменённые записи не
 * в счёт — за них не платили.
 */
export async function getServiceStats(tenantId: string, from: Date, to?: Date) {
  return db
    .select({
      serviceId: orders.serviceId,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
        notCanceled,
      ),
    )
    .groupBy(orders.serviceId);
}

export async function listServices(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.active, true)))
    .orderBy(services.sort);
}

/* Время живёт в `lib/time.ts`: оно нужно и браузеру, а здесь рядом с ним
   лежит база. Реэкспорт — чтобы вызывающим было всё равно, где оно. */
export { startOfDay, startOfDaysAgo, startOfMonth, startOfPrevMonth } from './time';

const notCanceled = isNull(orders.canceledAt);

/** Смена конкретного сотрудника: то, что он видит у себя на экране. */
export async function getShift(tenantId: string, staffId: string, from: Date) {
  const rows = await db
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        eq(orders.staffId, staffId),
        gte(orders.createdAt, from),
        notCanceled,
      ),
    )
    .orderBy(desc(orders.createdAt));

  const revenue = rows.reduce((s, o) => s + o.price, 0);
  const earned = rows.reduce((s, o) => s + Math.floor((o.price * o.staffPercent) / 100), 0);
  return { orders: rows, count: rows.length, revenue, earned };
}

export async function getPeriodStats(tenantId: string, from: Date, to?: Date) {
  const where = and(
    eq(orders.tenantId, tenantId),
    gte(orders.createdAt, from),
    to ? lt(orders.createdAt, to) : undefined,
    notCanceled,
  );

  /* Списание с абонемента — не выручка: деньги пришли при продаже.
     Считать их снова означало бы посчитать одни и те же драмы дважды. */
  const [totals] = await db
    .select({
      count: sql<number>`count(*)::int`,
      paidCount: sql<number>`count(*) filter (where ${orders.payment} <> 'pass')::int`,
      passUses: sql<number>`count(*) filter (where ${orders.payment} = 'pass')::int`,
      serviceRevenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
      cash: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} = 'cash'), 0)::int`,
    })
    .from(orders)
    .where(where);

  const byStaff = await db
    .select({
      staffId: orders.staffId,
      name: users.name,
      percent: users.percent,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}), 0)::int`,
      // зарплата считается по снимку процента в каждой записи, не по текущему
      earned: sql<number>`coalesce(sum(floor(${orders.price} * ${orders.staffPercent} / 100.0)), 0)::int`,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .where(where)
    .groupBy(orders.staffId, users.name, users.percent)
    .orderBy(sql`2 desc`);

  const passSales = await getPassSales(tenantId, from, to);
  const serviceRevenue = totals?.serviceRevenue ?? 0;
  const paidCount = totals?.paidCount ?? 0;

  return {
    /** машин помыто, включая по абонементу */
    count: totals?.count ?? 0,
    /** оплачено на месте */
    serviceRevenue,
    /** продано абонементов за период */
    passSales: passSales.revenue,
    passesSold: passSales.count,
    /** помыто по абонементу */
    passUses: totals?.passUses ?? 0,
    /** всего денег пришло в кассу */
    revenue: serviceRevenue + passSales.revenue,
    /**
     * Начислено исполнителям за период.
     *
     * Именно начислено, а не выплачено: работа сделана, деньги человеку
     * причитаются. Считать их своими до расчёта — тот же самообман, что
     * не считать аренду.
     */
    payroll: byStaff.reduce((sum, s) => sum + s.earned, 0),
    cash: totals?.cash ?? 0,
    // средний чек считаем только по оплаченным на месте: иначе один
    // проданный абонемент на 40 000 раздувает его до неузнаваемости
    avgCheck: paidCount ? Math.round(serviceRevenue / paidCount) : 0,
    byStaff,
  };
}

/**
 * Форма периода: сколько денег принесли часы дня или дни недели.
 *
 * У мойки день имеет рельеф — утренний заезд, дневной провал, вечерний
 * наплыв. Владелец это чувствует, но не видит; список записей рельеф
 * не показывает, а столбики показывают сразу.
 */
export async function getRevenueSeries(
  tenantId: string,
  from: Date,
  timezone: string,
  bucket: 'hour' | 'day',
  /* Верхняя граница обязательна с появлением закрытых периодов: без неё
     график «прошлого месяца» дорисовывал столбики уже наступившего. */
  to?: Date,
) {
  const local = sql`(${orders.createdAt} at time zone ${timezone})`;

  /* Ключ отдаём строкой, а не Date: timestamp without time zone при
     обратном разборе в JS молча трактуется как время сервера, и график
     съезжает на разницу часовых поясов. Текст такой двусмысленности
     не имеет. */
  return db
    .select({
      key: sql<string>`to_char(date_trunc(${bucket}, ${local}), 'YYYY-MM-DD HH24')`,
      revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
        notCanceled,
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Разбивка прихода по способу оплаты — для полосы вместо четырёх плиток. */
export async function getPaymentSplit(tenantId: string, from: Date, to?: Date) {
  const rows = await db
    .select({
      payment: orders.payment,
      revenue: sql<number>`coalesce(sum(${orders.price}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
        notCanceled,
      ),
    )
    .groupBy(orders.payment);

  return rows;
}

export async function getFeed(tenantId: string, from: Date, limit = 100, to?: Date) {
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      price: orders.price,
      serviceName: orders.serviceName,
      payment: orders.payment,
      staffName: users.name,
      /* Процент — снимок внутри записи, а не текущая ставка человека:
         поменяли ставку сегодня — вчерашние записи остаются как были. */
      staffPercent: orders.staffPercent,
      clientKey: clients.key,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .leftJoin(clients, eq(clients.id, orders.clientId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        // верхняя граница нужна истории: у неё день закрытый, а не «с тех пор»
        to ? lt(orders.createdAt, to) : undefined,
        notCanceled,
      ),
    )
    .orderBy(desc(orders.createdAt))
    .limit(limit);
}

/* --------------------------- зарплаты ---------------------------- *
 * Фиксированное «за 7 дней» не годится: на мойке рассчитываются когда
 * придётся — в понедельник, через десять дней, как получится. Поэтому
 * считаем не за период, а с момента последнего расчёта по каждому.
 * Тогда двойная выплата невозможна в принципе, а не «если не забыть».
 * ----------------------------------------------------------------- */

/** До какого момента с каждым уже рассчитались. */
export async function getSettledUntil(tenantId: string): Promise<Map<string, Date>> {
  const rows = await db
    .select({
      staffId: payouts.staffId,
      until: sql<string>`max(${payouts.periodTo})`,
    })
    .from(payouts)
    .where(eq(payouts.tenantId, tenantId))
    .groupBy(payouts.staffId);

  return new Map(rows.map((r) => [r.staffId, new Date(r.until)]));
}

export type PayrollRow = {
  staffId: string | null;
  name: string | null;
  percent: number | null;
  count: number;
  revenue: number;
  earned: number;
  /* Границы ставок, по которым сумма НА САМОМ ДЕЛЕ посчитана. Не то же,
     что `percent`: тот текущий, а деньги считаются по снимку в каждой
     записи. Пока ставку не меняли, они совпадают; после изменения —
     расходятся, и показывать вместо них текущую значит врать. */
  pctFrom: number | null;
  pctTo: number | null;
};

export type PayrollDay = {
  staffId: string | null;
  /** день в часовом поясе мойки, `YYYY-MM-DD` */
  day: string;
  count: number;
  revenue: number;
  earned: number;
};

/**
 * То же неоплаченное, но разложенное по дням.
 *
 * Одна растущая сумма не читается. У мойщика, которому не платили
 * неделю, в строке стоит «21 машина» — и владелец не понимает, за что
 * это: за сегодня, за вчера, за весь месяц. Деньги, которые нельзя
 * разложить на дни, вызывают спор ровно тот же, ради устранения
 * которого продукт и написан.
 *
 * Граница дня — полночь в часовом поясе мойки, а не фиксированный час.
 * Час пришлось бы спрашивать у каждого: одна мойка закрывается в
 * восемь, другая работает до полуночи, а третья круглосуточно. Полночь
 * не требует настройки и ни одну смену не разрезает пополам — кроме
 * круглосуточной, где резать всё равно придётся где-то.
 */
export async function getUnsettledByDay(
  tenantId: string,
  timezone: string,
  until: Date = new Date(),
): Promise<PayrollDay[]> {
  return db
    .select({
      staffId: orders.staffId,
      day: sql<string>`to_char(date_trunc('day', ${orders.createdAt} at time zone ${timezone}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}), 0)::int`,
      earned: sql<number>`coalesce(sum(floor(${orders.price} * ${orders.staffPercent} / 100.0)), 0)::int`,
    })
    .from(orders)
    .where(
      and(
        eq(orders.tenantId, tenantId),
        notCanceled,
        lt(orders.createdAt, until),
        sql`${orders.createdAt} > coalesce(
          (select max(p.period_to) from payouts p where p.staff_id = ${orders.staffId}),
          to_timestamp(0)
        )`,
      ),
    )
    .groupBy(orders.staffId, sql`2`)
    .orderBy(desc(sql`2`));
}

/**
 * Сколько причитается каждому с момента последнего расчёта.
 * `until` фиксирует верхнюю границу, чтобы запись, созданная во время
 * нажатия кнопки, не потерялась между суммой и отметкой о выплате.
 */
export async function getUnsettledPayroll(
  tenantId: string,
  until: Date = new Date(),
): Promise<PayrollRow[]> {
  return db
    .select({
      staffId: orders.staffId,
      name: users.name,
      percent: users.percent,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orders.price}), 0)::int`,
      earned: sql<number>`coalesce(sum(floor(${orders.price} * ${orders.staffPercent} / 100.0)), 0)::int`,
      pctFrom: sql<number>`min(${orders.staffPercent})::int`,
      pctTo: sql<number>`max(${orders.staffPercent})::int`,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        notCanceled,
        lt(orders.createdAt, until),
        sql`${orders.createdAt} > coalesce(
          (select max(p.period_to) from payouts p where p.staff_id = ${orders.staffId}),
          to_timestamp(0)
        )`,
      ),
    )
    .groupBy(orders.staffId, users.name, users.percent)
    .orderBy(desc(sql`3`));
}

export async function listPayouts(tenantId: string, limit = 20) {
  return db
    .select({
      id: payouts.id,
      amount: payouts.amount,
      paidAt: payouts.paidAt,
      periodFrom: payouts.periodFrom,
      periodTo: payouts.periodTo,
      staffName: users.name,
    })
    .from(payouts)
    .leftJoin(users, eq(users.id, payouts.staffId))
    .where(eq(payouts.tenantId, tenantId))
    .orderBy(desc(payouts.paidAt))
    .limit(limit);
}

/* Клиент с нулём визитов — призрак: его единственную запись отменили.
   Строку не удаляем (вернётся — upsert её оживит), но нигде не
   показываем: подсказка «был 0 раз на 0 ֏» сбивает с толку, а в
   средний доход с клиента такой призрак вносит перекос. */
const realClient = gt(clients.visits, 0);

/** Полная выгрузка за период, включая отменённые: это архив, а не отчёт. */
export async function exportOrders(tenantId: string, from: Date, to?: Date) {
  return db
    .select({
      createdAt: orders.createdAt,
      clientKey: clients.key,
      serviceName: orders.serviceName,
      price: orders.price,
      payment: orders.payment,
      staffName: users.name,
      staffPercent: orders.staffPercent,
      canceledAt: orders.canceledAt,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .leftJoin(clients, eq(clients.id, orders.clientId))
    .where(
      and(
        eq(orders.tenantId, tenantId),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
      ),
    )
    .orderBy(orders.createdAt);
}

/**
 * Сравнение ключа клиента, устойчивое к написанию.
 *
 * `99FF333` и `99 FF 333` — одна машина, и в базе за годы накопились
 * оба написания. Сравнивать по красивой форме нельзя: половина записей
 * заведена по-старому, слитно, и поиск по ним не находил ничего —
 * открытая из ленты машина отвечала 404. Складываем обе стороны к
 * слитной форме, её и сравниваем.
 */
function sameClientKey(key: string) {
  /* Выражение слово в слово как в уникальном индексе из миграции
     `0017_canonical_client_plates`: только тогда база берёт индекс, а не
     перебирает таблицу целиком на каждом открытии карточки. */
  return sql`regexp_replace(upper(${clients.key}), '[[:space:]-]+', '', 'g') = ${compactClientKey(key)}`;
}

export async function findClient(tenantId: string, key: string) {
  const [c] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sameClientKey(key), realClient));
  return c ?? null;
}

export async function listClients(tenantId: string, limit = 500) {
  return db
    .select({
      id: clients.id,
      key: clients.key,
      name: clients.name,
      phone: clients.phone,
      visits: clients.visits,
      total: clients.total,
      lastSeenAt: clients.lastSeenAt,
      /* Дни молчания считает база, а не страница.

         `Date.now()` в разметке — это чтение часов во время отрисовки:
         у сервера и браузера они разные, и «3 օր առաջ» на сервере
         превращалось в «4 օր առաջ» после гидратации. Тот же приём уже
         применён к простою бизнесов в админке. */
      daysSince: sql<number>`floor(extract(epoch from (now() - ${clients.lastSeenAt})) / 86400)::int`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), realClient))
    .orderBy(desc(clients.lastSeenAt))
    .limit(limit);
}

/**
 * История одной машины: сам клиент и всё, что он у нас мыл.
 *
 * Список клиентов отвечает «кто это и сколько принёс», но следующий
 * вопрос владельца всегда один и тот же: **что именно он у меня брал**.
 * Без ответа строка списка — тупик, а сам список превращается в счётчик,
 * по которому ничего нельзя решить.
 *
 * Отменённые записи не показываем: клиент за них не платил, и в его
 * итоге их нет. Показать их здесь значило бы, что сумма в шапке
 * перестанет сходиться с лентой под ней.
 */
export async function getClientHistory(tenantId: string, key: string, limit = 200) {
  const [client] = await db
    .select({
      id: clients.id,
      key: clients.key,
      name: clients.name,
      phone: clients.phone,
      visits: clients.visits,
      total: clients.total,
      lastSeenAt: clients.lastSeenAt,
      // считает база — см. listClients
      daysSince: sql<number>`floor(extract(epoch from (now() - ${clients.lastSeenAt})) / 86400)::int`,
    })
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), sameClientKey(key)));

  if (!client) return null;

  const rows = await db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      price: orders.price,
      serviceName: orders.serviceName,
      payment: orders.payment,
      staffName: users.name,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .where(and(eq(orders.tenantId, tenantId), eq(orders.clientId, client.id), notCanceled))
    .orderBy(desc(orders.createdAt))
    .limit(limit);

  return { client, orders: rows };
}

/**
 * На чём бизнес зарабатывает.
 *
 * Стало возможным только со строками услуг: пока услуга была одна на
 * запись, «комплекс с химчисткой» распадался на две машины, и разрез по
 * услугам считал бы то же самое враньё.
 *
 * Считаем по прайсовой цене строки, а не по взятой: скидка живёт на счёте
 * целиком, и разносить её по услугам пришлось бы наугад. Владельцу здесь
 * важно другое — что чаще заказывают и что дороже стоит.
 */
export async function getServiceBreakdown(tenantId: string, from: Date, to?: Date) {
  return db
    .select({
      serviceId: orderItems.serviceId,
      name: orderItems.serviceName,
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${orderItems.price}), 0)::int`,
    })
    .from(orderItems)
    .innerJoin(orders, eq(orders.id, orderItems.orderId))
    .where(
      and(
        eq(orderItems.tenantId, tenantId),
        gte(orders.createdAt, from),
        to ? lt(orders.createdAt, to) : undefined,
        // отменённая запись не должна попадать в разрез, как не попадает
        // в выручку
        isNull(orders.canceledAt),
        // списание с абонемента деньгами в этот день не было
        sql`${orders.payment} <> 'pass'`,
      ),
    )
    .groupBy(orderItems.serviceId, orderItems.serviceName)
    .orderBy(sql`3 desc`);
}
