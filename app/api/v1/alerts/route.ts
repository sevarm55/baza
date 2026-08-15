import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { alertSnoozes } from '@/lib/db/schema';
import { getAlerts, SNOOZE_DAYS } from '@/lib/alerts';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Что сегодня требует внимания владельца.
 *
 * Та же сборка, что и у колокольчика в кабинете, — не вторая копия
 * правил. Расходиться им нельзя: продукт, который на телефоне считает
 * поводы иначе, чем в браузере, врёт в одном из двух мест.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    return ok({ alerts: await getAlerts(ctx.tenant.id, ctx.user.id, ctx.tenant.timezone, ctx.locale) });
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Отложить повод на неделю.
 *
 * Не «прочитано»: повод — состояние, и оно никуда не делось. Через
 * неделю он вернётся, если ничего не изменилось.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const data = await body<{ key?: unknown }>(request);
    const key = str(data?.key);
    if (!key) return fail('BAD_REQUEST', 400);

    const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000);

    await db
      .insert(alertSnoozes)
      .values({ tenantId: ctx.tenant.id, userId: ctx.user.id, key, until })
      /* Отложить дважды нельзя — второй раз просто продлевает срок. */
      .onConflictDoUpdate({
        target: [alertSnoozes.userId, alertSnoozes.key],
        set: { until, tenantId: ctx.tenant.id },
      });

    return ok({ alerts: await getAlerts(ctx.tenant.id, ctx.user.id, ctx.tenant.timezone, ctx.locale) });
  } catch (e) {
    return failFromError(e);
  }
}
