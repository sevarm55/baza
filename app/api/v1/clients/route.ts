import { ensureDb } from '@/lib/db/ready';
import { listClients } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * База клиентов.
 *
 * Дни с последнего визита считает сервер: у него правильный «сейчас» и
 * зона бизнеса. Порог «давно не был» приложение решает само — это вопрос
 * подачи, а не данных.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const rows = await listClients(ctx.tenant.id);
    const now = Date.now();

    return ok({
      clients: rows.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        phone: c.phone,
        visits: c.visits,
        total: c.total,
        lastSeenAt: c.lastSeenAt,
        daysSince: Math.floor((now - c.lastSeenAt.getTime()) / 86_400_000),
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
