import { ensureDb } from '@/lib/db/ready';
import { RefreshRejected, rotate } from '@/lib/api/tokens';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Обмен refresh на новую пару токенов.
 *
 * Старый refresh при этом умирает. Приложение обязано сохранить новый
 * ДО следующего запроса: если оно потеряет ответ, придётся входить
 * заново — это цена того, что украденный токен работает ровно один раз.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();

    const input = await body<{ refresh?: string }>(request);
    const token = str(input?.refresh);
    if (!token) return fail('BAD_REQUEST', 400);

    const issued = await rotate(token);
    return ok({
      access: issued.access,
      refresh: issued.refresh,
      expiresIn: issued.expiresIn,
    });
  } catch (e) {
    if (e instanceof RefreshRejected) return fail('UNAUTHORIZED', 401);
    return failFromError(e);
  }
}
