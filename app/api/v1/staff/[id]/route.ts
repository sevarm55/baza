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

    /* Присланное меняем, остальное не трогаем. Отсутствие поля и пустое
       поле — разные вещи: первое значит «не про это», второе — «сотри»,
       и превращать первое во второе нельзя ни для имени, ни для ставки.
     *
     * `null` в ставке — отдельная история и самая дорогая. `Number(null)`
     * это ноль, поэтому запрос `{"percent": null}` отвечал «сохранено» и
     * ставил человеку ноль процентов: он продолжал мыть машины, а
     * зарплата переставала начисляться совсем. Заметно это становится в
     * день расчёта, когда пересчитывать уже нечего — снимки в записях
     * легли с нулём. Поэтому ставкой считается только число. */
    if (input.percent !== undefined && typeof input.percent !== 'number') {
      return fail('BAD_REQUEST', 400, { reason: 'BAD_PERCENT' });
    }
    if (input.name !== undefined && typeof input.name !== 'string') {
      return fail('BAD_REQUEST', 400, { reason: 'NAME_REQUIRED' });
    }

    const user = await saveStaff({
      tenantId: ctx.tenant.id,
      id,
      name: input.name === undefined ? undefined : str(input.name),
      percent: input.percent,
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
