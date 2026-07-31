import { ensureDb } from '@/lib/db/ready';
import { getShift, startOfDay } from '@/lib/queries';
import { cashInShift, closeShift, currentShift, openShift } from '@/lib/shifts';
import { authorize, denied } from '@/lib/api/guard';
import { body, failFromError, ok } from '@/lib/api/respond';

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
    const [shift, open] = await Promise.all([
      getShift(ctx.tenant.id, ctx.user.id, from),
      currentShift(ctx.tenant.id, ctx.user.id, from),
    ]);

    /* Сколько наличных набралось с начала смены — чтобы при закрытии
       подставить сумму, а не заставлять человека считать в уме. */
    const cashSoFar = open
      ? await cashInShift(ctx.tenant.id, ctx.user.id, open.openedAt, new Date())
      : 0;

    return ok({
      from: from.toISOString(),
      onShift: open !== null,
      openedAt: open?.openedAt ?? null,
      cashSoFar,
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

/**
 * Встать на смену или уйти с неё.
 *
 * Владельцу тоже можно: на маленькой мойке он сам моет машины, и его
 * присутствие такое же, как у остальных.
 *
 * `write: true` намеренно: встать на смену — это начать работу, и на
 * просроченной подписке она закрыта так же, как запись машин. Иначе
 * получилось бы, что смена идёт, а записывать в неё нечего.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ open?: boolean; cash?: number | null }>(request);
    const from = startOfDay(ctx.tenant.timezone);

    if (input?.open === false) {
      /* Сумму принимаем только целым и неотрицательным. Не число —
         значит «не отметил», а не ноль: это разные вещи, и владелец
         должен их различать. */
      const declared =
        typeof input.cash === 'number' && Number.isInteger(input.cash) && input.cash >= 0
          ? input.cash
          : null;

      const closed = await closeShift(ctx.tenant.id, ctx.user.id, declared);
      return ok({
        onShift: false,
        openedAt: null,
        cashExpected: closed?.expected ?? 0,
        cashDeclared: closed?.declared ?? null,
      });
    }

    const shift = await openShift(ctx.tenant.id, ctx.user.id, from);
    return ok({ onShift: true, openedAt: shift.openedAt });
  } catch (e) {
    return failFromError(e);
  }
}
