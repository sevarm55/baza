import { ensureDb } from '@/lib/db/ready';
import { createOrder, type Payment } from '@/lib/orders';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

const PAYMENTS: Payment[] = ['cash', 'card', 'transfer', 'pass'];

/**
 * Запись работы — главный эндпоинт продукта.
 *
 * Идемпотентен по `ref`. Приложение придумывает ref само, до отправки, и
 * кладёт запись в свою очередь. Дальше досылка может уйти сколько угодно
 * раз: сервер по ref поймёт, что это та же машина, а не вторая.
 *
 * Различие в коде ответа существует ради очереди, а не ради красоты:
 *   201 — записали сейчас, можно убирать из очереди;
 *   200 — уже было, тоже можно убирать.
 * Ошибкой повтор не является ни в каком виде: телефон, не дождавшийся
 * ответа, поступил правильно.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{
      ref?: string;
      clientKey?: string;
      serviceId?: string;
      /** несколько услуг за один заезд */
      serviceIds?: string[];
      payment?: string;
      passId?: string;
      note?: string;
      /** сколько взяли, если меньше прайса */
      price?: number;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const payment = str(input.payment) as Payment;
    if (!PAYMENTS.includes(payment)) return fail('BAD_REQUEST', 400);

    const clientKey = str(input.clientKey);
    /* Принимаем обе формы: телефоны со старой версией шлют одну услугу,
       и их накопленная офлайн-очередь обязана доехать. */
    const serviceIds = Array.isArray(input.serviceIds)
      ? input.serviceIds.map(str).filter(Boolean)
      : [];
    const serviceId = str(input.serviceId);
    if ((serviceIds.length === 0 && !serviceId) || !clientKey) {
      return fail('BAD_REQUEST', 400);
    }

    const result = await createOrder({
      tenantId: ctx.tenant.id,
      staffId: ctx.user.id,
      serviceId: serviceId || undefined,
      serviceIds: serviceIds.length > 0 ? serviceIds : undefined,
      clientKey,
      payment,
      passId: str(input.passId) || undefined,
      clientRef: str(input.ref) || undefined,
      note: str(input.note) || undefined,
      price: typeof input.price === 'number' ? input.price : undefined,
    });

    return ok(
      {
        order: {
          id: result.order.id,
          serviceName: result.order.serviceName,
          price: result.order.price,
          listPrice: result.order.listPrice,
          staffPercent: result.order.staffPercent,
          payment: result.order.payment,
          createdAt: result.order.createdAt,
        },
        duplicate: result.duplicate,
      },
      result.duplicate ? 200 : 201,
    );
  } catch (e) {
    return failFromError(e);
  }
}
