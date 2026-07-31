import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent } from '@/lib/api/respond';

/**
 * Что присылать владельцу.
 *
 * Пока настройка одна — уведомлять ли о каждой записи. Смен две в день,
 * а машин сорок; одним выключателем на всё человек убил бы и то, что
 * хотел получать. Об открытии смены сообщаем всегда: это событие редкое
 * и как раз то, ради чего уведомления и заводились.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ orders?: boolean }>(request);
    if (typeof input?.orders !== 'boolean') return fail('BAD_REQUEST', 400);

    await db
      .update(users)
      .set({ notifyOrders: input.orders })
      .where(eq(users.id, ctx.user.id));

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
