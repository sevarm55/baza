import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import { audit, clients, orders, passes, services, users } from './db/schema';

export type Payment = 'cash' | 'card' | 'transfer' | 'pass';

export type CreateOrderInput = {
  tenantId: string;
  staffId: string;
  serviceId: string;
  /** номер машины или телефон — то, что ввёл сотрудник */
  clientKey: string;
  payment: Payment;
  /** обязателен при payment: 'pass' */
  passId?: string;
  /** идентификатор с телефона: делает повторную отправку безопасной */
  clientRef?: string;
  note?: string;
};

export class NotFoundError extends Error {}
/** Такая запись уже есть — повторная досылка, не ошибка пользователя. */
export class DuplicateError extends Error {}

/**
 * Создание записи.
 *
 * Три вещи, которые здесь важнее всего:
 *
 * 1. Всё в одной транзакции. Запись без обновлённого клиента или наоборот —
 *    это расхождение цифр, а расхождение цифр убивает доверие к продукту.
 *
 * 2. Цена, название услуги и процент сотрудника пишутся СНИМКОМ.
 *    Владелец поднимет цену в марте — февральская зарплата обязана
 *    остаться прежней.
 *
 * 3. Услуга, сотрудник и абонемент проверяются на принадлежность тенанту.
 *    Server Action можно дёрнуть напрямую POST-запросом с чужим id.
 */
export async function createOrder(input: CreateOrderInput) {
  const key = input.clientKey.trim().toUpperCase();
  if (!key) throw new NotFoundError('EMPTY_CLIENT_KEY');
  if (input.payment === 'pass' && !input.passId) throw new NotFoundError('PASS_REQUIRED');

  return db.transaction(async (tx) => {
    /* Досылка из офлайн-очереди может прийти дважды: телефон не дождался
       ответа и повторил. Ту же запись просто возвращаем — счётчики
       клиента и абонемента при этом не трогаются вообще. */
    if (input.clientRef) {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(
          and(eq(orders.tenantId, input.tenantId), eq(orders.clientRef, input.clientRef)),
        );
      if (existing) {
        return { order: existing, client: null, service: null, duplicate: true };
      }
    }

    const [service] = await tx
      .select()
      .from(services)
      .where(and(eq(services.id, input.serviceId), eq(services.tenantId, input.tenantId)));
    if (!service) throw new NotFoundError('SERVICE_NOT_FOUND');

    const [staff] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.staffId), eq(users.tenantId, input.tenantId)));
    if (!staff) throw new NotFoundError('STAFF_NOT_FOUND');

    const now = new Date();

    // upsert клиента одним запросом — счётчики не разъедутся при гонке
    const [client] = await tx
      .insert(clients)
      .values({
        tenantId: input.tenantId,
        key,
        visits: 1,
        total: input.payment === 'pass' ? 0 : service.price,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [clients.tenantId, clients.key],
        set: {
          visits: sql`${clients.visits} + 1`,
          total: sql`${clients.total} + ${input.payment === 'pass' ? 0 : service.price}`,
          lastSeenAt: now,
        },
      })
      .returning();

    /* Списание с абонемента. Условия проверяются прямо в UPDATE:
       два мойщика могут нажать «абонемент» одновременно, и только один
       из них должен списать последнюю мойку. */
    let price = service.price;
    let passId: string | null = null;

    if (input.payment === 'pass') {
      const [used] = await tx
        .update(passes)
        .set({ usedUses: sql`${passes.usedUses} + 1` })
        .where(
          and(
            eq(passes.id, input.passId!),
            eq(passes.tenantId, input.tenantId),
            eq(passes.clientId, client.id),
            sql`${passes.usedUses} < ${passes.totalUses}`,
            or(isNull(passes.expiresAt), gt(passes.expiresAt, now)),
          ),
        )
        .returning();
      if (!used) throw new NotFoundError('PASS_UNAVAILABLE');

      // выручки нет — деньги пришли при продаже; но мойщику платим
      // от номинала одной мойки внутри абонемента
      price = used.unitPrice;
      passId = used.id;
    }

    const [order] = await tx
      .insert(orders)
      .values({
        tenantId: input.tenantId,
        clientId: client.id,
        staffId: staff.id,
        serviceId: service.id,
        serviceName: service.name,
        price,
        staffPercent: staff.percent,
        payment: input.payment,
        passId,
        clientRef: input.clientRef ?? null,
        note: input.note?.trim() || null,
        createdAt: now,
      })
      .onConflictDoNothing({ target: [orders.tenantId, orders.clientRef] })
      .returning();

    // одновременная досылка того же ref: транзакция откатится целиком,
    // и счётчики клиента с абонементом не удвоятся
    if (!order) throw new DuplicateError('DUPLICATE_REF');

    await tx.insert(audit).values({
      tenantId: input.tenantId,
      userId: staff.id,
      action: 'create',
      entity: 'order',
      entityId: order.id,
      data: { key, service: service.name, price, payment: input.payment },
    });

    return { order, client, service, duplicate: false };
  });
}

/**
 * Мягкая отмена: запись остаётся в истории и в аудите, но перестаёт
 * попадать в выручку и зарплату. Счётчики клиента откатываются,
 * списанная мойка возвращается в абонемент.
 */
export async function cancelOrder(params: {
  tenantId: string;
  orderId: string;
  byUserId: string;
  /** если задано — отменить можно только запись этого сотрудника */
  onlyOwnedBy?: string;
}) {
  return db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(orders)
      .where(
        and(
          eq(orders.id, params.orderId),
          eq(orders.tenantId, params.tenantId),
          params.onlyOwnedBy ? eq(orders.staffId, params.onlyOwnedBy) : undefined,
        ),
      );
    if (!order) throw new NotFoundError('ORDER_NOT_FOUND');
    if (order.canceledAt) return order;

    await tx.update(orders).set({ canceledAt: new Date() }).where(eq(orders.id, order.id));

    if (order.clientId) {
      await tx
        .update(clients)
        .set({
          visits: sql`greatest(${clients.visits} - 1, 0)`,
          total: sql`greatest(${clients.total} - ${
            order.payment === 'pass' ? 0 : order.price
          }, 0)`,
        })
        .where(eq(clients.id, order.clientId));
    }

    if (order.passId) {
      await tx
        .update(passes)
        .set({ usedUses: sql`greatest(${passes.usedUses} - 1, 0)` })
        .where(eq(passes.id, order.passId));
    }

    await tx.insert(audit).values({
      tenantId: params.tenantId,
      userId: params.byUserId,
      action: 'cancel',
      entity: 'order',
      entityId: order.id,
      data: { price: order.price, service: order.serviceName },
    });

    return order;
  });
}
