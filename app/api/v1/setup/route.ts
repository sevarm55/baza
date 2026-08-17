import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { users } from '@/lib/db/schema';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, noContent } from '@/lib/api/respond';

/**
 * Что человек сделал с онбордингом.
 *
 * Три действия, и ни одно не трогает бизнес: прочитал приветствие, убрал
 * «Начало работы», вернул его обратно. Само состояние настройки сюда не
 * ходит — оно приезжает вместе со сводкой (`/api/v1/summary`), потому
 * что считается по тем же данным и меняется вместе с ними. Отдельный GET
 * означал бы второй round-trip на связи, которой во дворе мойки может и
 * не быть.
 *
 * `anyPlan`, потому что просрочка к онбордингу отношения не имеет: у
 * владельца с закрытым счётом окно приветствия всё равно не должно
 * появляться второй раз.
 *
 * Роль не проверяется: приветствие есть и у мойщика, а «Начало работы»
 * ему просто не показывают — решает это клиент, у которого и так есть
 * роль. Проверять её здесь значило бы запретить мойщику отметить своё
 * собственное приветствие прочитанным.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { anyPlan: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ action?: string }>(request);

    /* Дата, а не флаг: отвечает и на «делал ли», и на «когда». Возврат
       настройки поэтому стирает её в null, а не ставит `false`. */
    const now = new Date();
    const patch =
      input?.action === 'welcome'
        ? { welcomeSeenAt: now }
        : input?.action === 'hide'
          ? { setupHiddenAt: now }
          : input?.action === 'resume'
            ? { setupHiddenAt: null }
            : null;

    if (!patch) return fail('BAD_REQUEST', 400);

    await db
      .update(users)
      .set(patch)
      .where(and(eq(users.id, ctx.user.id), eq(users.tenantId, ctx.tenant.id)));

    return noContent();
  } catch (e) {
    return failFromError(e);
  }
}
