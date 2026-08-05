import { ensureDb } from '@/lib/db/ready';
import { remindExpiring } from '@/lib/admin-billing';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Напоминание владельцу платформы: у кого завтра кончается доступ.
 *
 * Раз в сутки, а не раз в час: это письмо про завтрашний день, и второе
 * такое же через час — не забота, а повод выключить уведомления.
 *
 * Отдельным эндпоинтом по той же причине, что и закрытие смен: образ —
 * это собранный Next без скриптов, а расписание снаружи видно в
 * `crontab -l`.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    // без секрета маршрута как будто нет
    if (!secret) return fail('NOT_FOUND', 404);

    const header = request.headers.get('authorization') ?? '';
    if (header !== `Bearer ${secret}`) return fail('NOT_FOUND', 404);

    await ensureDb();
    const done = await remindExpiring();

    if (done.notified > 0) {
      console.warn(`[platform] завтра кончается срок у ${done.notified}`);
    }
    return ok(done);
  } catch (e) {
    return failFromError(e);
  }
}
