import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { sessions } from '@/lib/db/schema';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Устройства, с которых сейчас есть вход.
 *
 * Список свой, а не всего бизнеса: владелец не должен через API видеть
 * телефоны сотрудников — для этого есть кабинет и другие основания.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const rows = await db
      .select({
        id: sessions.id,
        kind: sessions.kind,
        device: sessions.device,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .where(and(eq(sessions.userId, ctx.user.id), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastSeenAt));

    return ok({
      devices: rows.map((r) => ({ ...r, current: r.id === ctx.claims.sid })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
