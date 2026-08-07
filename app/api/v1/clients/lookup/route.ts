import { ensureDb } from '@/lib/db/ready';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { orders } from '@/lib/db/schema';
import { findClient } from '@/lib/queries';
import { listActivePasses } from '@/lib/passes';
import { passesEnabled } from '@/lib/features';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Узнавание клиента при вводе.
 *
 * Ради этого экран записи и существует в три касания: мойщик набирает
 * номер, и ещё до выбора услуги видит, что машина уже была — сколько раз,
 * когда в последний, на сколько всего. Продавать постоянному клиенту
 * иначе, чем новому, можно только если знаешь, что он постоянный.
 *
 * Отсутствие клиента — не ошибка: большинство машин приезжает впервые.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const key = new URL(request.url).searchParams.get('key')?.trim() ?? '';
    if (!key) return fail('BAD_REQUEST', 400);

    const client = await findClient(ctx.tenant.id, key);
    if (!client) return ok({ known: null, passes: [] });

    const passes = passesEnabled() ? await listActivePasses(ctx.tenant.id, client.id) : [];

    /* Каким классом эту машину записывали в прошлый раз.
       Класс принадлежит машине, а не заезду: джип не станет седаном между
       мойками. Поэтому для знакомого номера выбор подставляется сам, и
       тарифы не стоят мойщику ни одного лишнего касания. */
    const [last] = await db
      .select({ tier: orders.tier })
      .from(orders)
      .where(and(eq(orders.tenantId, ctx.tenant.id), eq(orders.clientId, client.id), isNotNull(orders.tier)))
      .orderBy(desc(orders.createdAt))
      .limit(1);

    return ok({
      known: {
        id: client.id,
        key: client.key,
        name: client.name,
        visits: client.visits,
        total: client.total,
        lastSeenAt: client.lastSeenAt,
        lastTier: last?.tier ?? null,
      },
      passes,
    });
  } catch (e) {
    return failFromError(e);
  }
}
