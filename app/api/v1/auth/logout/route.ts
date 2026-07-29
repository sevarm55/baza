import { ensureDb } from '@/lib/db/ready';
import { revokeByRefresh } from '@/lib/api/tokens';
import { body, failFromError, noContent, str } from '@/lib/api/respond';

/**
 * Выход из приложения.
 *
 * Отвечает 204 всегда, даже на мусорный токен: клиент всё равно уже стёр
 * его у себя, и сообщать ему «такого не было» бессмысленно, а вот
 * подтверждать существование чужих токенов — вредно.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const input = await body<{ refresh?: string }>(request);
    const token = str(input?.refresh);
    if (token) await revokeByRefresh(token);
    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
