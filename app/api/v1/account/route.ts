import { ensureDb } from '@/lib/db/ready';
import { verifyPin } from '@/lib/pin';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { deleteBusiness } from '@/lib/account';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent, str } from '@/lib/api/respond';

/**
 * Удаление бизнеса из приложения.
 *
 * PIN спрашивается заново, хотя запрос и так пришёл с живым токеном.
 * Причина не в токене, а в телефоне: он лежит на мойке, разблокированный,
 * и между «зашёл посмотреть выручку» и «стёр всё» должно стоять что-то,
 * чего случайный человек рядом не знает. Face ID здесь не годится —
 * он открывает приложение, а не подтверждает решение.
 *
 * Тот же счётчик попыток, что на входе: иначе этот эндпоинт становится
 * тихим способом подобрать PIN владельца — без блокировки и без следа
 * в истории входов.
 *
 * `anyPlan` намеренно: уйти можно и с просроченной, и с отключённой
 * подпиской. Иначе неоплата превращается в удержание чужих данных.
 */
export async function DELETE(request: Request) {
  try {
    await ensureDb();

    const ctx = await authorize(request, { owner: true, anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ pin?: string }>(request);
    const pin = str(input?.pin);
    if (!pin) return fail('BAD_REQUEST', 400);

    const ip = clientIp(request.headers);
    const guard = await checkLogin(ctx.user.phone, ip);
    if (!guard.allowed) {
      return fail('TOO_MANY_TRIES', 429, { retryAfter: guard.retryAfter });
    }

    const good = await verifyPin(pin, ctx.user.pinHash);
    await noteLogin(ctx.user.phone, ip, good);
    if (!good) return fail('WRONG_CREDENTIALS', 401);

    const gone = await deleteBusiness(ctx.tenant.id);

    /* Журнал удаляется вместе с бизнесом, поэтому единственный след
       операции — строчка в логе сервера. Для необратимого действия это
       минимум: иначе на вопрос «куда делся бизнес» ответить нечем. */
    console.warn(
      `[account] удалён бизнес ${ctx.tenant.id} (${ctx.tenant.name}), людей: ${gone.people}`,
    );

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
