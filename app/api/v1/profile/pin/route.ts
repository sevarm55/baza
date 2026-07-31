import { ensureDb } from '@/lib/db/ready';
import { changePin, ProfileError } from '@/lib/profile';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { issueForDevice } from '@/lib/api/tokens';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Смена PIN.
 *
 * Старый спрашивается обязательно, и тот же счётчик попыток, что на
 * входе: иначе это тихий способ подобрать PIN изнутри уже открытого
 * приложения — без блокировки и без следа в истории входов.
 *
 * После смены все сессии гаснут, включая ту, из которой пришёл запрос, —
 * в этом весь смысл. Но человека, который только что сменил PIN, выкидывать
 * из приложения незачем: сразу выдаём ему новую пару токенов на это
 * устройство. Все остальные телефоны выходят.
 *
 * `anyPlan`: закрыть доступ можно в любом состоянии счёта. Безопасность
 * не должна зависеть от оплаты.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ current?: string; next?: string; device?: string }>(request);
    const current = str(input?.current);
    const next = str(input?.next);
    if (!current || !next) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const guard = await checkLogin(ctx.user.phone, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    try {
      await changePin(ctx.user.id, current, next);
    } catch (e) {
      if (e instanceof ProfileError && e.message === 'WRONG_PIN') {
        await noteLogin(ctx.user.phone, ip, false);
        return fail('WRONG_CREDENTIALS', 401);
      }
      throw e;
    }
    await noteLogin(ctx.user.phone, ip, true);

    const issued = await issueForDevice({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      role: ctx.user.role === 'owner' ? 'owner' : 'staff',
      device: str(input?.device) || null,
    });

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
    });
  } catch (e) {
    if (e instanceof ProfileError) return fail('BAD_REQUEST', 400, { reason: e.message });
    return failFromError(e);
  }
}
