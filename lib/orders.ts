import { and, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { priceForTier, tierIndexOf, tiersOf } from './catalog';
import { db } from './db';
import {
  audit,
  clients,
  orderItems,
  orders,
  passes,
  services,
  tenants,
  users,
} from './db/schema';
import { formatMoney } from './money';
import { notifyOwnersInBackground } from './push';
import { normalizeClientKey } from './client-key';
import { DEFAULT_LOCALE, dict } from './i18n';

export type Payment = 'cash' | 'card' | 'transfer' | 'pass';

export type CreateOrderInput = {
  tenantId: string;
  staffId: string;
  /**
   * Одна услуга. Оставлена ради телефонов со старой версией: в их
   * офлайн-очереди лежат записи этого вида, и они обязаны доехать.
   * Новые записи присылают `serviceIds`.
   */
  serviceId?: string;
  /** Несколько услуг за один заезд: комплекс и химчистка салона. */
  serviceIds?: string[];
  /** номер машины или телефон — то, что ввёл сотрудник */
  clientKey: string;
  payment: Payment;
  /** обязателен при payment: 'pass' */
  passId?: string;
  /** идентификатор с телефона: делает повторную отправку безопасной */
  clientRef?: string;
  /**
   * Тариф — СЛОВОМ, как его видел мойщик («Ջիպ»).
   *
   * Не номером: телефон мог не знать о вчерашней перестановке классов, и
   * номер указал бы на соседний. Слово либо совпадает с одним из тарифов
   * бизнеса, либо не совпадает ни с одним — и тогда цена базовая.
   */
  tier?: string;
  note?: string;
  /**
   * Сколько взяли на самом деле, если меньше прайса.
   *
   * Скидки на мойке дают — постоянному клиенту, за брак, «по-соседски».
   * Пока продукт этого не умел, мойщик выбирал услугу подешевле или не
   * записывал вовсе, и цифры расходились с кассой. А как только они
   * разошлись, продукту перестают верить.
   */
  price?: number;
  /**
   * Язык и валюта уведомления — бизнеса, а не того, кто нажал кнопку.
   *
   * Пуш собирает сервер, спросить человека негде; то же правило уже
   * работает у смен (`openShift`). Оба необязательны и падают на
   * умолчания: запись машины не имеет права сломаться из-за того, что
   * вызывающий не передал язык сообщения.
   */
  locale?: string;
  currency?: string;
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
  const key = normalizeClientKey(input.clientKey);
  if (!key) throw new NotFoundError('EMPTY_CLIENT_KEY');
  /* Номер машины — семь знаков, телефон — двенадцать. Всё, что длиннее
     тридцати двух, приходит не от человека: так выглядит вставленный
     мимо поля текст или сорвавшийся сканер. Пустить это в базу значит
     получить в списке клиентов строку на весь экран и такую же в
     выгрузке — а чинить её потом нечем, ключ клиента не правится. */
  if (key.length > 32) throw new NotFoundError('CLIENT_KEY_TOO_LONG');
  if (input.payment === 'pass' && !input.passId) throw new NotFoundError('PASS_REQUIRED');

  const made = await db.transaction(async (tx) => {
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

    /* Список услуг в порядке, в котором их выбрали: он же порядок строк
       и порядок слов в названии записи. */
    const wanted = input.serviceIds?.length
      ? input.serviceIds
      : input.serviceId
        ? [input.serviceId]
        : [];
    if (wanted.length === 0) throw new NotFoundError('SERVICE_NOT_FOUND');

    const found = await tx
      .select()
      .from(services)
      .where(and(inArray(services.id, wanted), eq(services.tenantId, input.tenantId)));

    /* Порядок восстанавливаем по запросу, а не по тому, как их вернула
       база: «комплекс + химчистка» и «химчистка + комплекс» — это одно и
       то же для денег, но разное для человека, который перечитывает
       список. */
    const picked = wanted.map((id) => found.find((s) => s.id === id));
    if (picked.some((s) => !s)) throw new NotFoundError('SERVICE_NOT_FOUND');
    const chosen = picked as typeof found;

    // первая услуга — та, по которой запись называют и ищут
    const service = chosen[0];

    const [staff] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, input.staffId), eq(users.tenantId, input.tenantId)));
    if (!staff) throw new NotFoundError('STAFF_NOT_FOUND');

    const now = new Date();

    /* Цену считаем ДО клиента: его итог обязан расти на взятую сумму, а
       не на прайсовую. Иначе скидка раздувала бы историю клиента, и
       «всего оставил 80 000» перестало бы быть правдой. */
    /* Тариф разрешаем по названию и один раз на всю запись: класс машины
       принадлежит машине, а не услуге, и «джип по комплексу, седан по
       химчистке» — это не бизнес-случай, а способ ошибиться. */
    const [tenant] = await tx.select().from(tenants).where(eq(tenants.id, input.tenantId));
    const tierIndex = tenant ? tierIndexOf(tenant, input.tier) : null;
    const tierName = tierIndex == null ? null : tiersOf(tenant!)[tierIndex];

    const listPrice = chosen.reduce((sum, s) => sum + priceForTier(s, tierIndex), 0);
    let price = listPrice;

    /* Скидка — только вниз и только в пределах прайса. Свободное поле
       цены превратило бы запись в место, где сумму назначают, а не
       фиксируют, и контроль, ради которого продукт стоит, исчез бы.
       Наценка — отдельный разговор, здесь её намеренно нет. */
    if (typeof input.price === 'number' && input.payment !== 'pass') {
      const asked = Math.round(input.price);
      if (!Number.isFinite(asked) || asked < 0 || asked > listPrice) {
        throw new NotFoundError('BAD_PRICE');
      }
      price = asked;
    }

    // upsert клиента одним запросом — счётчики не разъедутся при гонке
    const [client] = await tx
      .insert(clients)
      .values({
        tenantId: input.tenantId,
        key,
        visits: 1,
        total: input.payment === 'pass' ? 0 : price,
        firstSeenAt: now,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: [clients.tenantId, clients.key],
        set: {
          visits: sql`${clients.visits} + 1`,
          total: sql`${clients.total} + ${input.payment === 'pass' ? 0 : price}`,
          lastSeenAt: now,
        },
      })
      .returning();

    /* Списание с абонемента. Условия проверяются прямо в UPDATE:
       два мойщика могут нажать «абонемент» одновременно, и только один
       из них должен списать последнюю мойку. */
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
        serviceName: chosen.map((s) => s.name).join(' + '),
        tier: tierName,
        price,
        listPrice,
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

    await tx.insert(orderItems).values(
      chosen.map((s, i) => ({
        tenantId: input.tenantId,
        orderId: order.id,
        serviceId: s.id,
        serviceName: s.name,
        price: priceForTier(s, tierIndex),
        sort: i,
      })),
    );

    await tx.insert(audit).values({
      tenantId: input.tenantId,
      userId: staff.id,
      action: 'create',
      entity: 'order',
      entityId: order.id,
      data: {
        key,
        services: chosen.map((s) => s.name),
        price,
        listPrice,
        payment: input.payment,
      },
    });

    return { order, client, service, duplicate: false };
  });

  /* Уведомление шлём ПОСЛЕ транзакции и в фоне.
     После — потому что внутри запись ещё может откатиться, и владелец
     получил бы сообщение о машине, которой нет. В фоне — потому что
     недоступность Apple не должна ронять запись: мойщик стоит с
     телефоном у машины, и его дело важнее нашего уведомления.

     Досылку из очереди не объявляем: `duplicate` означает, что запись
     уже была, и второе сообщение о ней — шум. */
  if (!made.duplicate) {
    notifyOwnersInBackground(
      input.tenantId,
      made.order.staffId,
      {
        title: made.client?.key ?? made.order.serviceName,
        // скидку показываем сразу: она всплывает в тот же вечер, а не
        // через месяц при сверке
        body: discountLine(
          made.order.serviceName,
          made.order.price,
          made.order.listPrice,
          input.locale ?? DEFAULT_LOCALE,
          input.currency,
        ),
        thread: 'orders',
      },
      'orders',
    );
  }

  return made;
}

/**
 * «Комплекс · 4 000 ֏» или «Комплекс · 4 000 ֏ (вместо 5 000 ֏)».
 *
 * Язык — бизнеса (`tenants.locale`), а не того, кто нажал кнопку: пуш
 * собирает сервер, спросить человека негде, и то же правило уже работает
 * у смен (`openShift`). Здесь вторая половина строки была написана
 * по-армянски прямо в коде, и у русского владельца получалось
 * «Комплекс · 4 000 ֏ (5 000-ի փոխարեն)» — половина фразы на чужом
 * языке.
 */
function discountLine(
  service: string,
  price: number,
  listPrice: number | null,
  locale: string,
  currency?: string,
): string {
  const money = (sum: number) => formatMoney(sum, currency, locale);
  const line = `${service} · ${money(price)}`;
  if (listPrice === null || listPrice <= price) return line;
  return `${line} (${dict(locale).push.orderInstead(money(listPrice))})`;
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
