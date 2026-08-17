import { ensureDb } from '@/lib/db/ready';
import { listDevices } from '@/lib/devices';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Устройства, с которых сейчас есть вход.
 *
 * Список свой, а не всего бизнеса: владелец не должен через API видеть
 * сессии сотрудников — уволить человека он и так может, а разглядывать
 * его устройства оснований нет.
 *
 * Считает `lib/devices.ts` — тот же код, которым живёт кабинет. Веб
 * спрашивает то же самое серверным действием, и два ответа на один
 * вопрос расходиться не должны.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    /* anyPlan: закрыть чужой вход надо уметь в любом состоянии счёта.
       Безопасность не зависит от оплаты — то же правило, что у смены
       PIN и удаления бизнеса. */
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    return ok({ devices: await listDevices(ctx.user.id, ctx.claims.sid) });
  } catch (e) {
    return failFromError(e);
  }
}
