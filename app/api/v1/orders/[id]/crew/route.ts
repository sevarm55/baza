import { ensureDb } from '@/lib/db/ready';
import { setOrderCrew } from '@/lib/orders';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, isUuid, ok, str } from '@/lib/api/respond';

/**
 * Изменить состав уже записанной работы.
 *
 * Нужно ровно для одного случая, и он частый: машину мыли втроём, а
 * записавший отметил двоих. Без правки третий остаётся без денег
 * навсегда, а единственным выходом была бы отмена записи и повторный
 * ввод — то есть потеря номера, услуги и порядка в ленте ради одной
 * галочки.
 *
 * ВЛАДЕЛЬЦУ, а не любому вошедшему. Состав — это чужая зарплата, и
 * переставлять её должен тот, кто её платит. Мойщик, которому позволили
 * бы править состав, мог бы вычеркнуть коллегу из вчерашней машины и
 * забрать его долю; заметить это было бы нечем, кроме памяти обиженного.
 *
 * Как пересчитывается фонд и почему прошлая ставка при этом не трогается
 * — в `setOrderCrew`.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('ORDER_NOT_FOUND', 404);

    const input = await body<{ participants?: string[] }>(request);
    const participants = Array.isArray(input?.participants)
      ? input.participants.map(str).filter(Boolean)
      : [];
    /* Пустой состав — не «убрать всех», а испорченный запрос. Машина,
       за которую не начислено никому, деньгами не является ни для кого:
       она пропала бы из ведомостей всех участников молча. */
    if (participants.length === 0) return fail('BAD_REQUEST', 400);

    const result = await setOrderCrew({
      tenantId: ctx.tenant.id,
      orderId: id,
      byUserId: ctx.user.id,
      participantIds: participants,
    });

    return ok({ changed: result.changed, percent: result.percent, pool: result.pool });
  } catch (e) {
    return failFromError(e);
  }
}
