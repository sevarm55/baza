import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { revokeDevice } from '@/lib/devices';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, isUuid, noContent } from '@/lib/api/respond';

/**
 * Отключить устройство.
 *
 * Гасить можно только своё: id сессии — угадываемый uuid, и без проверки
 * владельца любой вошедший выкидывал бы кого угодно. Проверка живёт в
 * `lib/devices.ts`, прямо в условии UPDATE, и её же использует кабинет.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await ensureDb();
    /* anyPlan: закрыть чужой вход надо уметь в любом состоянии счёта. */
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const { id } = await params;
    if (!isUuid(id)) return fail('NOT_FOUND', 404);

    const gone = await revokeDevice({
      userId: ctx.user.id,
      sessionId: id,
      tenantId: ctx.tenant.id,
      phone: ctx.account.phone,
      ip: clientIp(request.headers),
    });

    if (!gone) return fail('NOT_FOUND', 404);
    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
