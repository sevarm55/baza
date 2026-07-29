import { ensureDb } from '@/lib/db/ready';
import { cancelOrder } from '@/lib/orders';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, isUuid, ok } from '@/lib/api/respond';

/**
 * Отмена записи.
 *
 * Сотрудник отменяет только свою — иначе один мойщик стирал бы работу
 * другого. Владельцу можно любую: это его бизнес и его цифры.
 *
 * Отмена мягкая: запись остаётся в истории и в аудите, но перестаёт
 * попадать в выручку и зарплату.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('ORDER_NOT_FOUND', 404);

    await cancelOrder({
      tenantId: ctx.tenant.id,
      orderId: id,
      byUserId: ctx.user.id,
      onlyOwnedBy: ctx.user.role === 'owner' ? undefined : ctx.user.id,
    });

    return ok({}, 204);
  } catch (e) {
    return failFromError(e);
  }
}
