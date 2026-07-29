import { ensureDb } from '@/lib/db/ready';
import { getShift, startOfDay } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Смена сотрудника — главный экран приложения.
 *
 * Начало дня считается в зоне БИЗНЕСА, а не телефона. Мойщик может быть в
 * роуминге или с неверно выставленным часовым поясом; «сегодня» при этом
 * обязано означать то же самое, что у владельца в кабинете. Поэтому
 * границу суток приложение никогда не вычисляет само.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const from = startOfDay(ctx.tenant.timezone);
    const shift = await getShift(ctx.tenant.id, ctx.user.id, from);

    return ok({
      from: from.toISOString(),
      count: shift.count,
      revenue: shift.revenue,
      earned: shift.earned,
      percent: ctx.user.percent,
      orders: shift.orders.map((o) => ({
        id: o.id,
        serviceName: o.serviceName,
        price: o.price,
        payment: o.payment,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
