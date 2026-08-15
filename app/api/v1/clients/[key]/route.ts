import { ensureDb } from '@/lib/db/ready';
import { getClientHistory } from '@/lib/queries';
import { decodeClientKey } from '@/lib/client-key';
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
    const found = await getClientHistory(ctx.tenant.id, decodeClientKey(key));
    if (!found) return fail('NOT_FOUND', 404);

    const { client, orders } = found;

    return ok({
      client: {
        id: client.id,
        key: client.key,
        name: client.name,
        phone: client.phone,
        visits: client.visits,
        total: client.total,
        /* Когда приехал впервые. В списке это не нужно — там сравнивают
           давность последнего визита, — а в карточке это первое, что
           спрашивают про постоянного: «он у меня давно?» */
        firstSeenAt: client.firstSeenAt,
        lastSeenAt: client.lastSeenAt,
        // считает база, тем же выражением, что и список
        daysSince: client.daysSince,
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
