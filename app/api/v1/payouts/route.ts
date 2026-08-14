import { ensureDb } from '@/lib/db/ready';
import { settleMany, settleStaff } from '@/lib/payroll';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Отметить расчёт с сотрудником — с одним или сразу с несколькими.
 *
 * Сумма НЕ принимается от клиента — только имя сотрудника и день.
 * Считает сервер, и это принципиально: иначе подделанный запрос запишет
 * в историю выплат любую цифру.
 *
 * Два вида тела, и старый никуда не делся: приложения, выпущенные до
 * дневного листа, продолжают слать `{staffId, throughDay}` и работать
 * ровно как раньше.
 *
 *   {staffId, day}            — один человек за один день
 *   {items: [{staffId, day}]} — расчёт за день целиком, одним моментом
 *
 * Список — не удобство, а условие правды в истории: `now()` в постгресе
 * это время начала транзакции, и три отдельных запроса легли бы тремя
 * моментами. Владелец отдал деньги один раз, и выглядеть это обязано
 * одной выдачей.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{
      staffId?: string;
      throughDay?: string;
      day?: string;
      items?: { staffId?: string; day?: string }[];
    }>(request);

    if (Array.isArray(input?.items)) {
      /* Разбираем каждую пару, а не доверяем форме тела: одна строка без
         дня закрыла бы человеку все незакрытые дни разом. */
      const items: { staffId: string; day: string }[] = [];
      for (const raw of input.items) {
        const staffId = str(raw?.staffId);
        const day = str(raw?.day);
        if (!staffId || !day) return fail('BAD_REQUEST', 400);
        items.push({ staffId, day });
      }

      const result = await settleMany({
        tenantId: ctx.tenant.id,
        byUserId: ctx.user.id,
        timezone: ctx.tenant.timezone,
        items,
      });

      return ok(result);
    }

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
