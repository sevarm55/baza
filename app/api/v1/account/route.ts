import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import { checkDeleteProof, deleteBusiness } from '@/lib/account';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent, str } from '@/lib/api/respond';

/**
 * Удаление бизнеса из приложения.
 *
 * Подтверждение спрашивается заново, хотя запрос и так пришёл с живым
 * токеном. Причина не в токене, а в телефоне: он лежит на мойке,
 * разблокированный, и между «зашёл посмотреть выручку» и «стёр всё»
 * должно стоять что-то, чего случайный человек рядом не знает. Face ID
 * здесь не годится — он открывает приложение, а не подтверждает решение.
 *
 * Подтверждается ПАРОЛЕМ, одним шагом: DELETE { password } → удалено.
 * Раньше путей было два — PIN, если он заведён, и код из SMS, если нет.
 * Кодов из SMS у продукта больше нет, а PIN перестал быть входом.
 *
 * `anyPlan` намеренно: уйти можно и с просроченной, и с отключённой
 * подпиской. Иначе неоплата превращается в удержание чужих данных.
 */
export async function DELETE(request: Request) {
  try {
    await ensureDb();

    const ctx = await authorize(request, { owner: true, anyPlan: true });
    if (denied(ctx)) return ctx;

    const ip = clientIp(request.headers);
    const input = (await body<{ password?: string }>(request)) ?? {};

    const proof = await checkDeleteProof({
      account: ctx.account,
      ip,
      password: str(input.password),
    });

    if (!proof.ok) {
      if (proof.problem === 'THROTTLED') {
        return fail('TOO_MANY_TRIES', 429, { retryAfter: proof.retryAfter });
      }
      return fail('WRONG_CREDENTIALS', 401);
    }

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
