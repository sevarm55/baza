import { ensureDb } from '@/lib/db/ready';
import { clientIp } from '@/lib/login-guard';
import {
  checkDeleteProof,
  deleteBusiness,
  deleteNeedsCode,
  startDeleteCode,
} from '@/lib/account';
import { maskPhone } from '@/lib/phone';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent, ok, str } from '@/lib/api/respond';

/**
 * Удаление бизнеса из приложения.
 *
 * Подтверждение спрашивается заново, хотя запрос и так пришёл с живым
 * токеном. Причина не в токене, а в телефоне: он лежит на мойке,
 * разблокированный, и между «зашёл посмотреть выручку» и «стёр всё»
 * должно стоять что-то, чего случайный человек рядом не знает. Face ID
 * здесь не годится — он открывает приложение, а не подтверждает решение.
 *
 * Чем именно подтверждать, решает состояние аккаунта, а не клиент (см.
 * `deleteNeedsCode` в lib/account.ts):
 *
 *   есть PIN  — DELETE { pin }                  → удалено
 *   нет PIN   — DELETE { }                      → 202 и код на телефон
 *               DELETE { challengeId, code }    → удалено
 *
 * Два шага одним маршрутом, потому что это один сценарий, а шаг виден по
 * тому, что прислали. Так же устроены восстановление PIN и смена номера.
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
    const input = (await body<{ pin?: string; challengeId?: string; code?: string }>(request)) ?? {};

    /* Кода нет и заявки нет — значит это первый шаг: высылаем SMS и
       отвечаем 202. Ничего не удалено, и код ответа об этом честно
       говорит. */
    if (deleteNeedsCode(ctx.account) && !str(input.challengeId)) {
      const started = await startDeleteCode({
        account: ctx.account,
        ip,
        locale: ctx.locale,
      });

      if (!started.ok) {
        if (started.problem === 'THROTTLED') {
          return fail('TOO_MANY_TRIES', 429, { retryAfter: started.retryAfter });
        }
        return fail('SMS_FAILED', 503);
      }

      return ok(
        {
          challengeId: started.challengeId,
          phone: maskPhone(ctx.account.phone),
          resendAt: started.resendAt.toISOString(),
          expiresAt: started.expiresAt.toISOString(),
        },
        202,
      );
    }

    const proof = await checkDeleteProof({
      account: ctx.account,
      ip,
      pin: str(input.pin),
      challengeId: str(input.challengeId),
      code: str(input.code),
    });

    if (!proof.ok) {
      switch (proof.problem) {
        case 'THROTTLED':
          return fail('TOO_MANY_TRIES', 429, { retryAfter: proof.retryAfter });
        case 'CODE_EXPIRED':
          return fail('OTP_EXPIRED', 410);
        case 'CODE_TOO_MANY':
          return fail('OTP_TOO_MANY', 429);
        case 'CODE_INVALID':
          return fail('OTP_INVALID', 401);
        /* Сюда попадает только клиент, приславший заявку пустой строкой:
           первый шаг выше её перехватывает. */
        case 'NEED_CODE':
          return fail('BAD_REQUEST', 400, { reason: 'NEED_CODE' });
        default:
          return fail('WRONG_CREDENTIALS', 401);
      }
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
