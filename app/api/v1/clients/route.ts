import { ensureDb } from '@/lib/db/ready';
import { listClients } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * База клиентов.
 *
 * Дни с последнего визита считает база — тем же выражением, которым их
 * получает кабинет. Здесь стоял второй счёт: `Date.now()` минус
 * `lastSeenAt` прямо в маршруте. Числа обычно совпадали, а расходились
 * ровно на границе суток и на отрицательной давности — приложение
 * показывало «−1 օր առաջ» там, где кабинет уже говорил «сегодня». Один
 * ответ на один вопрос считается один раз.
 *
 * Порог «давно не был» приложение решает само — это вопрос подачи, а не
 * данных.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const rows = await listClients(ctx.tenant.id);

    return ok({
      clients: rows.map((c) => ({
        id: c.id,
        key: c.key,
        name: c.name,
        phone: c.phone,
        visits: c.visits,
        total: c.total,
        lastSeenAt: c.lastSeenAt,
        daysSince: c.daysSince,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
