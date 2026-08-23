import { and, desc, eq, gt, gte, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './db';
import { recordActivity } from './activity';
import { audit, clients, passes, services, users } from './db/schema';
import { NotFoundError } from './orders';
import { normalizeClientKey } from './client-key';

export type SellPassInput = {
  tenantId: string;
  soldBy: string;
  clientKey: string;
  serviceId: string;
  totalUses: number;
  /** сколько клиент платит за весь абонемент */
  price: number;
  /** срок в днях; 0 или undefined — бессрочный */
  validDays?: number;
};

/**
 * Продажа абонемента.
 *
 * Это событие ПРИХОДА денег. Дальнейшие списания выручку не создают,
 * поэтому здесь важно записать и общую цену, и номинал одной мойки:
 * от номинала потом считается процент мойщика.
 */
export async function sellPass(input: SellPassInput) {
  const key = normalizeClientKey(input.clientKey);
  if (!key) throw new NotFoundError('EMPTY_CLIENT_KEY');
  if (!Number.isInteger(input.totalUses) || input.totalUses < 1) {
    throw new NotFoundError('BAD_USES');
  }
  if (!Number.isFinite(input.price) || input.price < 0) throw new NotFoundError('BAD_PRICE');

  return db.transaction(async (tx) => {
    const [service] = await tx
      .select()
      .from(services)
      .where(and(eq(services.id, input.serviceId), eq(services.tenantId, input.tenantId)));
    if (!service) throw new NotFoundError('SERVICE_NOT_FOUND');

    // клиент может быть новым — абонемент часто и есть первый контакт
    const [client] = await tx
      .insert(clients)
      .values({ tenantId: input.tenantId, key })
      .onConflictDoUpdate({
        target: [clients.tenantId, clients.key],
        set: { key },
      })
      .returning();

    const [pass] = await tx
      .insert(passes)
      .values({
        tenantId: input.tenantId,
        clientId: client.id,
        serviceId: service.id,
        serviceName: service.name,
        totalUses: input.totalUses,
        price: input.price,
        unitPrice: Math.floor(input.price / input.totalUses),
        soldBy: input.soldBy,
        expiresAt: input.validDays
          ? new Date(Date.now() + input.validDays * 86_400_000)
          : null,
      })
      .returning();

    await tx.insert(audit).values({
      tenantId: input.tenantId,
      userId: input.soldBy,
      action: 'create',
      entity: 'pass',
      entityId: pass.id,
      data: { key, service: service.name, uses: input.totalUses, price: input.price },
    });

    await recordActivity(tx, {
      tenantId: input.tenantId,
      type: 'pass.sold',
      actorId: input.soldBy,
      entityId: pass.id,
      data: { key, service: service.name, amount: input.price, count: input.totalUses },
    });

    return { pass, client };
  });
}

const stillUsable = and(
  sql`${passes.usedUses} < ${passes.totalUses}`,
  or(isNull(passes.expiresAt), gt(passes.expiresAt, sql`now()`)),
);

/** Абонементы клиента, которые ещё можно списать. */
export async function listActivePasses(tenantId: string, clientId: string) {
  return db
    .select({
      id: passes.id,
      serviceId: passes.serviceId,
      serviceName: passes.serviceName,
      totalUses: passes.totalUses,
      usedUses: passes.usedUses,
      unitPrice: passes.unitPrice,
      expiresAt: passes.expiresAt,
    })
    .from(passes)
    .where(and(eq(passes.tenantId, tenantId), eq(passes.clientId, clientId), stillUsable))
    .orderBy(passes.expiresAt);
}

export async function listPasses(tenantId: string, limit = 100) {
  return db
    .select({
      id: passes.id,
      serviceName: passes.serviceName,
      totalUses: passes.totalUses,
      usedUses: passes.usedUses,
      price: passes.price,
      soldAt: passes.soldAt,
      expiresAt: passes.expiresAt,
      clientKey: clients.key,
      soldByName: users.name,
    })
    .from(passes)
    .leftJoin(clients, eq(clients.id, passes.clientId))
    .leftJoin(users, eq(users.id, passes.soldBy))
    .where(eq(passes.tenantId, tenantId))
    .orderBy(desc(passes.soldAt))
    .limit(limit);
}

/** Сколько денег принесли абонементы за период — это отдельная строка выручки. */
export async function getPassSales(tenantId: string, from: Date, to?: Date) {
  const [row] = await db
    .select({
      count: sql<number>`count(*)::int`,
      revenue: sql<number>`coalesce(sum(${passes.price}), 0)::int`,
    })
    .from(passes)
    .where(
      and(
        eq(passes.tenantId, tenantId),
        // именно gte/lt, а не sql`... >= ${from}`: в сыром шаблоне дата
        // уезжает драйверу как есть, и postgres-js её отвергает.
        // PGlite локально это прощал — поймалось только на сервере.
        gte(passes.soldAt, from),
        to ? lt(passes.soldAt, to) : undefined,
      ),
    );
  return { count: row?.count ?? 0, revenue: row?.revenue ?? 0 };
}
