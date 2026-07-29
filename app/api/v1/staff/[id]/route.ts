import { ensureDb } from '@/lib/db/ready';
import { deactivateStaff, saveStaff, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, isUuid, noContent, ok, str } from '@/lib/api/respond';

/**
 * Имя и процент.
 *
 * Процент меняется только на будущее: в каждом заказе лежит снимок, и
 * прошлые зарплаты не пересчитываются. Без этого нельзя было бы спокойно
 * менять ставки.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    const input = await body<{ name?: string; percent?: number }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const user = await saveStaff({
      tenantId: ctx.tenant.id,
      id,
      name: str(input.name),
      percent: Number(input.percent),
    });

    return ok({ staff: { id: user.id, name: user.name, percent: user.percent } });
  } catch (e) {
    if (e instanceof ValidationError) {
      return fail(e.message === 'NOT_FOUND' ? 'NOT_FOUND' : 'BAD_REQUEST', e.message === 'NOT_FOUND' ? 404 : 400, {
        reason: e.message,
      });
    }
    return failFromError(e);
  }
}

/** Отключить. Сессии сотрудника гасятся сразу — см. lib/catalog.ts. */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    await deactivateStaff({ tenantId: ctx.tenant.id, id, actorId: ctx.user.id });
    return noContent();
  } catch (e) {
    if (e instanceof ValidationError) {
      // «сам себя» — это запрет, а не отсутствие: 403 честнее 404
      const self = e.message === 'CANNOT_DEACTIVATE_SELF';
      return fail(self ? 'FORBIDDEN' : 'NOT_FOUND', self ? 403 : 404, { reason: e.message });
    }
    return failFromError(e);
  }
}
