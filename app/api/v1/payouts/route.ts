import { ensureDb } from '@/lib/db/ready';
import { settleStaff } from '@/lib/payroll';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Отметить расчёт с сотрудником.
 *
 * Сумма НЕ принимается от клиента — только имя сотрудника. Считает
 * сервер, и это принципиально: иначе подделанный запрос запишет в историю
 * выплат любую цифру.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ staffId?: string }>(request);
    const staffId = str(input?.staffId);
    if (!staffId) return fail('BAD_REQUEST', 400);

    const result = await settleStaff({
      tenantId: ctx.tenant.id,
      staffId,
      byUserId: ctx.user.id,
    });

    return ok(result);
  } catch (e) {
    return failFromError(e);
  }
}
