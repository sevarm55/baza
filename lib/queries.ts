import { and, desc, eq, gt, gte, isNull, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { clients, orders, payouts, services, tenants, users } from './db/schema';
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

    db
      .select({ tenantId: users.tenantId, name: users.name, phone: users.phone })
      .from(users)
      .where(eq(users.role, 'owner')),

    db
      .select({
        tenantId: orders.tenantId,
        orderCount: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${orders.price}) filter (where ${orders.payment} <> 'pass'), 0)::int`,
        lastOrderAt: sql<string | null>`max(${orders.createdAt})`,
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
      staffCount: staffBy.get(t.id) ?? 0,
      orderCount: a?.orderCount ?? 0,
      revenue: a?.revenue ?? 0,
      lastOrderAt: a?.lastOrderAt ? new Date(a.lastOrderAt) : null,
    };
  });
}

export async function getTenant(tenantId: string) {
  const [t] = await db.select().from(tenants).where(eq(tenants.id, tenantId));
  return t ?? null;
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

export async function listServices(tenantId: string) {
  return db
    .select()
    .from(services)
    .where(and(eq(services.tenantId, tenantId), eq(services.active, true)))
    .orderBy(services.sort);
}

/** Начало «сегодня» в часовом поясе бизнеса, а не сервера. */
export function startOfDay(timezone: string, at = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const localMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'),
    get('minute'),
    get('second'),
  );
  const offset = localMs - at.getTime();
  return new Date(Date.UTC(get('year'), get('month') - 1, get('day')) - offset);
}

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
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), notCanceled))
    .groupBy(sql`1`)
    .orderBy(sql`1`);
}

/** Разбивка прихода по способу оплаты — для полосы вместо четырёх плиток. */
export async function getPaymentSplit(tenantId: string, from: Date) {
  const rows = await db
    .select({
      payment: orders.payment,
      revenue: sql<number>`coalesce(sum(${orders.price}), 0)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(orders)
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), notCanceled))
    .groupBy(orders.payment);

  return rows;
}

export async function getFeed(tenantId: string, from: Date, limit = 100) {
  return db
    .select({
      id: orders.id,
      createdAt: orders.createdAt,
      price: orders.price,
      serviceName: orders.serviceName,
      payment: orders.payment,
      staffName: users.name,
      clientKey: clients.key,
    })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.staffId))
    .leftJoin(clients, eq(clients.id, orders.clientId))
    .where(and(eq(orders.tenantId, tenantId), gte(orders.createdAt, from), notCanceled))
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
};

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

export async function findClient(tenantId: string, key: string) {
  const [c] = await db
    .select()
    .from(clients)
    .where(
      and(
        eq(clients.tenantId, tenantId),
        eq(clients.key, key.trim().toUpperCase()),
        realClient,
      ),
    );
  return c ?? null;
}

export async function listClients(tenantId: string, limit = 500) {
  return db
    .select()
    .from(clients)
    .where(and(eq(clients.tenantId, tenantId), realClient))
    .orderBy(desc(clients.lastSeenAt))
    .limit(limit);
}
