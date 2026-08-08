import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { verifyPin } from '@/lib/pin';
import { normalizePhone } from '@/lib/phone';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { accountByPhone } from '@/lib/accounts';
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
       мойки, тот входит одним кодом в обе. Пока участие не привязано к
       человеку — сверяем по его собственной копии. */
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.phone, phone), eq(users.active, true)));

    const account = user?.accountId ? await accountByPhone(phone) : undefined;
    const secret = account?.pinHash ?? user?.pinHash;

    const good = secret ? await verifyPin(pin, secret) : false;
    await noteLogin(phone, ip, good);
    if (!user || !good) return fail('WRONG_CREDENTIALS', 401);

    const issued = await issueForDevice({
      tenantId: user.tenantId,
      userId: user.id,
      role: user.role === 'owner' ? 'owner' : 'staff',
      device: str(input.device) || null,
    });

    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
      user: { id: user.id, name: user.name, role: user.role, percent: user.percent },
    });
  } catch (e) {
    return failFromError(e);
  }
}
