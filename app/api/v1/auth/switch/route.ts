import { ensureDb } from '@/lib/db/ready';
import { listPoints, markPointUsed } from '@/lib/accounts';
import { authorize, denied } from '@/lib/api/guard';
import { issueForDevice } from '@/lib/api/tokens';
import { revokeSession } from '@/lib/auth';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Перейти на другую свою точку.
 *
 * `anyPlan`: уходить надо уметь в первую очередь именно с неоплаченной
 * точки. Закрой мы этот маршрут подпиской, владелец, заведший вторую
 * мойку, оказался бы заперт на её стене при работающей первой.
 *
 * Участие сервер находит сам, по человеку из токена. Приложение
 * присылает только id точки, и чужой id не подтверждается: ответ один и
 * тот же и для «не ваша точка», и для «такой точки нет» — иначе маршрут
 * превращается в способ проверять существование чужих бизнесов.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ tenantId?: string; device?: string }>(request);
    const target = str(input?.tenantId);
    if (!target) return fail('BAD_REQUEST', 400);

    const point = (await listPoints(ctx.account.id)).find((p) => p.id === target);
    if (!point) return fail('NOT_FOUND', 404);

    /* Новая пара токенов и новая строка сессии, а прежняя гасится.
       В вебе та же операция переиспользует строку — там сессия живёт в
       cookie, и переписать её можно на месте. Здесь у приложения на
       руках refresh, привязанный к строке: оставь мы её живой, у одного
       устройства оказалось бы два действующих ключа, и «выйти» гасило бы
       только один. */
    const issued = await issueForDevice({
      tenantId: point.id,
      userId: point.membershipId,
      role: point.role,
      device: str(input?.device) || null,
    });

    if (ctx.claims.sid) await revokeSession(ctx.claims.sid);
    await markPointUsed(point.membershipId);

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
      tenantId: point.id,
      points: await listPoints(ctx.account.id),
    });
  } catch (e) {
    return failFromError(e);
  }
}
