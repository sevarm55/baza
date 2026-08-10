import { ensureDb } from '@/lib/db/ready';
import { getClientHistory } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Что эта машина у нас мыла.
 *
 * Ключом идёт сам номер, а не идентификатор строки: приложение держит в
 * руках список клиентов, где номер — это и есть имя. Лишний
 * идентификатор пришлось бы таскать ради ничего.
 *
 * Владельцу и только: лента чужих визитов с суммами — это база
 * клиентов бизнеса, а не рабочий инструмент мойщика.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const { key } = await params;
    const found = await getClientHistory(ctx.tenant.id, decodeURIComponent(key));
    if (!found) return fail('NOT_FOUND', 404);

    const { client, orders } = found;
    const now = Date.now();

    return ok({
      client: {
        id: client.id,
        key: client.key,
        name: client.name,
        visits: client.visits,
        total: client.total,
        lastSeenAt: client.lastSeenAt,
        daysSince: Math.floor((now - client.lastSeenAt.getTime()) / 86_400_000),
      },
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        price: o.price,
        serviceName: o.serviceName,
        payment: o.payment,
        staffName: o.staffName,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
