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

    const input = await body<{ staffId?: string; throughDay?: string; day?: string }>(request);
    const staffId = str(input?.staffId);
    if (!staffId) return fail('BAD_REQUEST', 400);

    /* День строкой `YYYY-MM-DD`: за него и платим. Без него закрываются
       все незакрытые дни, по строке на каждый. */
    const day = str(input?.throughDay) || str(input?.day) || undefined;

    const result = await settleStaff({
      timezone: ctx.tenant.timezone,
      day,
      tenantId: ctx.tenant.id,
      staffId,
      byUserId: ctx.user.id,
    });

    return ok(result);
  } catch (e) {
    return failFromError(e);
  }
}
