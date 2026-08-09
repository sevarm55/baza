import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { verifyPin } from '@/lib/pin';
import { normalizePhone } from '@/lib/phone';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { accountByPhone, markPointUsed, pointForLogin } from '@/lib/accounts';
import { issueForDevice } from '@/lib/api/tokens';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Вход приложения.
 *
 * Тот же счётчик попыток, что и у веба: смысла защищать одну дверь и
 * оставить открытой вторую нет никакого. Ответ на неверный телефон и на
 * неверный PIN одинаковый — иначе эндпоинт превращается в способ узнать,
 * кто зарегистрирован.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ phone?: string; pin?: string; device?: string }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const phone = normalizePhone(str(input.phone));
    const pin = str(input.pin);
    if (!phone || !pin) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);

    const guard = await checkLogin(phone, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    /* Код спрашиваем у человека, а не у его работы на точке: у кого две
       мойки, тот входит одним кодом в обе. */
    const account = await accountByPhone(phone);

    /* Участие ищем только ради людей, которых завёл ещё старый код и не
       успел привязать. Своей копией кода они и сверяются. */
    const [legacy] = account
      ? []
      : await db.select().from(users).where(and(eq(users.phone, phone), eq(users.active, true)));

    const secret = account?.pinHash ?? legacy?.pinHash;
    const good = secret ? await verifyPin(pin, secret) : false;
    await noteLogin(phone, ip, good);
    if (!good) return fail('WRONG_CREDENTIALS', 401);

    /* Куда именно вести — решает pointForLogin, а не порядок строк в
       таблице. Телефон больше не уникален, индекса по нему нет, и
       «первая попавшаяся» означала бы случайную мойку. Открытая идёт
       первой: владельца с неоплаченной второй точкой нельзя высаживать
       на стену при работающей первой, тем более в приложении, где
       переключателя пока нет вовсе. */
    const point = account ? await pointForLogin(account.id) : undefined;

    const membership = point
      ? { id: point.membershipId, tenantId: point.id, role: point.role }
      : legacy
        ? { id: legacy.id, tenantId: legacy.tenantId, role: legacy.role === 'owner' ? ('owner' as const) : ('staff' as const) }
        : null;

    // код верный, а работать негде: все участия отключены
    if (!membership) return fail('WRONG_CREDENTIALS', 401);

    const issued = await issueForDevice({
      tenantId: membership.tenantId,
      userId: membership.id,
      role: membership.role,
      device: str(input.device) || null,
    });

    await markPointUsed(membership.id);

    const [me] = await db.select().from(users).where(eq(users.id, membership.id));

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
      user: { id: me.id, name: me.name, role: me.role, percent: me.percent },
    });
  } catch (e) {
    return failFromError(e);
  }
}
