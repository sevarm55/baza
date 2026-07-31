import { ensureDb } from '@/lib/db/ready';
import { BadExpenseError, editExpense, removeExpense } from '@/lib/expenses';
import { startOfDay } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, isUuid, noContent, ok } from '@/lib/api/respond';

/**
 * Убрать расход.
 *
 * Разовый удаляется совсем, постоянный закрывается датой — разница
 * в lib/expenses.ts. Снаружи это одно действие: человек не должен
 * держать в голове, какой из них как исчезает.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    const gone = await removeExpense(ctx.tenant.id, id, startOfDay(ctx.tenant.timezone));
    if (!gone) return fail('NOT_FOUND', 404);

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Изменить расход.
 *
 * Сумма постоянного расхода не переписывается на месте: изменение — это
 * конец старого и начало нового с того же дня, иначе подорожавшая аренда
 * задним числом съела бы прибыль за все прошлые месяцы. Подробности и
 * причина — в lib/expenses.ts; наружу это по-прежнему одно действие.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    const body = await request.json().catch(() => ({}));

    const row = await editExpense({
      tenantId: ctx.tenant.id,
      id,
      userId: ctx.user.id,
      amount: Number(body?.amount),
      category: String(body?.category ?? ''),
      note: body?.note == null ? null : String(body.note),
      dayStart: startOfDay(ctx.tenant.timezone),
    });
    if (!row) return fail('NOT_FOUND', 404);

    return ok({
      id: row.id,
      amount: row.amount,
      category: row.category,
      note: row.note,
      monthly: row.monthly,
      at: row.at,
    });
  } catch (e) {
    if (e instanceof BadExpenseError) return fail('BAD_REQUEST', 400);
    return failFromError(e);
  }
}
