import { ensureDb } from '@/lib/db/ready';
import { closeEvening } from '@/lib/shifts';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Вечернее закрытие смен. Дёргается расписанием раз в час.
 *
 * Отдельным эндпоинтом, а не задачей внутри приложения: образ — это
 * собранный Next без скриптов, и запустить внутри него нечего. Плюс
 * расписание снаружи видно и проверяемо: `crontab -l` показывает, что и
 * когда ходит.
 *
 * Раз в час, а не раз в сутки: у бизнесов разные часовые пояса, и «20:00»
 * у каждого своё. Задача сама решает, чей вечер уже наступил.
 *
 * Повторный вызов безвреден: закрывать нечего — значит и уведомлять не о
 * чем. Это важно, потому что cron перезапустится после сбоя и сходит
 * второй раз.
 */
export async function POST(request: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    /* Без секрета маршрута как будто нет. 404, а не 401: незачем
       подсказывать, что тут вообще что-то есть. */
    if (!secret) return fail('NOT_FOUND', 404);

    const header = request.headers.get('authorization') ?? '';
    if (header !== `Bearer ${secret}`) return fail('NOT_FOUND', 404);

    await ensureDb();
    const done = await closeEvening();

    if (done.shifts > 0) {
      console.warn(`[shifts] вечернее закрытие: ${done.shifts} смен в ${done.tenants} бизнесах`);
    }
    return ok(done);
  } catch (e) {
    return failFromError(e);
  }
}
