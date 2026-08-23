import { ensureDb } from '@/lib/db/ready';
import { saveTeamPercent, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Общий процент команды за совместную работу.
 *
 * Отдельный маршрут, а не поле профиля бизнеса: это условие оплаты
 * труда, и живёт оно рядом с людьми, а не рядом с названием точки. Тем
 * же соображением отдельно стоят тарифы (`/api/v1/tiers`) — они рядом с
 * прайсом.
 *
 * ЧТО ЭТО ЗА ЧИСЛО. Не «по столько каждому», а зарплата всей машины,
 * которую мыли вдвоём-втроём: `цена × процент` даёт фонд, фонд делится
 * поровну между участниками. Пятьдесят процентов на троих — это пять
 * тысяч с десятитысячной машины на всех, а не пятнадцать.
 *
 * `null` выключает свойство целиком: мойщику совместная работа больше не
 * предлагается, и запись с несколькими участниками сервер не примет.
 * Индивидуальный процент при этом работает как работал.
 *
 * Прошлое не пересчитывается ни при каком значении: применённая ставка и
 * посчитанные доли лежат снимками в самой записи.
 */
export async function PUT(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{ percent?: number | null }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    /* Отсутствие числа и ноль — разные ответы. Ноль это настоящий, хоть
       и странный, выбор владельца: «мойте вместе, доплаты нет». Пусто —
       «такого у нас не бывает», и свойство выключается. Свести их к
       одному значило бы отобрать у владельца один из двух ответов. */
    const percent =
      input.percent === null || input.percent === undefined ? null : Number(input.percent);

    const tenant = await saveTeamPercent({ tenantId: ctx.tenant.id, percent, actorId: ctx.user.id });

    return ok({ percent: tenant.teamPercent });
  } catch (e) {
    if (e instanceof ValidationError) return fail('BAD_REQUEST', 400, { reason: e.message });
    return failFromError(e);
  }
}
