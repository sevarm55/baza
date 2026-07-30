import { ensureDb } from '@/lib/db/ready';
import { removeExpense } from '@/lib/expenses';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, isUuid, noContent } from '@/lib/api/respond';

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

    const gone = await removeExpense(ctx.tenant.id, id);
    if (!gone) return fail('NOT_FOUND', 404);

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
