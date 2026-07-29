import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { sessions } from '@/lib/db/schema';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Отключить устройство.
 *
 * Гасить можно только своё: id сессии — угадываемый uuid, и без проверки
 * владельца любой вошедший выкидывал бы кого угодно.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const { id } = await params;
    const [row] = await db
      .update(sessions)
      .set({ revokedAt: new Date(), refreshHash: null })
      .where(and(eq(sessions.id, id), eq(sessions.userId, ctx.user.id)))
      .returning({ id: sessions.id });

    if (!row) return fail('NOT_FOUND', 404);
    return ok({}, 204);
  } catch (e) {
    return failFromError(e);
  }
}
