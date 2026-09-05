import { ensureDb } from '@/lib/db/ready';
import { changeOwnPassword } from '@/lib/auth-password';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { issueForDevice } from '@/lib/api/tokens';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Смена пароля из приложения.
 *
 * Пришла на место смены PIN. PIN был вторым ключом от входа, пока вход
 * держался на телефоне и коде из SMS; теперь входят логином и паролем, и
 * второго ключа не осталось — остался один, и меняют именно его.
 *
 * Текущий спрашивается обязательно, и тот же счётчик попыток, что на
 * входе: иначе это тихий способ подобрать пароль изнутри уже открытого
 * приложения — без блокировки и без следа в истории входов.
 *
 * После смены все сессии гаснут, включая ту, из которой пришёл запрос, —
 * в этом весь смысл. Но человека, который только что сменил пароль,
 * выкидывать из приложения незачем: сразу выдаём ему новую пару токенов
 * на это устройство. Все остальные телефоны выходят.
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
    /* Ключ счётчика — то, чем человек входит: у владельца почта, у
       сотрудника телефон. */
    const key = ctx.account.email ?? ctx.user.phone;

    const guard = await checkLogin(key, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    const done = await changeOwnPassword({
      accountId: ctx.account.id,
      current,
      next,
      ip,
    });

    if (!done.ok) {
      if (done.problem === 'WRONG_CURRENT') {
        await noteLogin(key, ip, false);
        return fail('WRONG_CREDENTIALS', 401);
      }
      return fail(done.problem === 'PASSWORD_COMMON' ? 'PASSWORD_COMMON' : 'PASSWORD_SHORT', 400);
    }

    await noteLogin(key, ip, true);

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
    return failFromError(e);
  }
}
