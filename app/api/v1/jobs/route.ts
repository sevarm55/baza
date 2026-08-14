import { ensureDb } from '@/lib/db/ready';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';
import { acceptJob, assignJob, cancelJob, listMyJobs, listOpenJobs, startJob } from '@/lib/jobs';

/**
 * Наряды: машины, которые приняли и передали мойщику.
 *
 * Списка два, и выбирает между ними не роль, а вопрос.
 *
 *   без параметра   — весь двор: что стоит на мойке прямо сейчас.
 *                     Так спрашивает сводка владельца.
 *   ?scope=mine     — только мои: что взять мне. Так спрашивает экран
 *                     смены, у кого бы он ни был открыт.
 *
 * Раньше выбирала роль, и на этом продукт врал: экран собственной смены
 * владельца звал тот же адрес и получал весь двор, поэтому в списке «мои
 * машины» у него висели машины Валода и Гаго. Владелец их раздаёт, а не
 * моет, и в его смене им делать нечего.
 *
 * Мойщику параметр ничего не меняет: своих он получал и получает.
 * Умолчание оставлено прежним нарочно — телефоны обновляются сами по
 * себе, и сборка, которая про параметр ещё не знает, обязана продолжать
 * работать.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const mine = new URL(request.url).searchParams.get('scope') === 'mine';

    const rows =
      ctx.user.role === 'owner' && !mine
        ? await listOpenJobs(ctx.tenant.id)
        : await listMyJobs(ctx.tenant.id, ctx.user.id);

    return ok({
      jobs: rows.map((j) => ({
        id: j.id,
        clientKey: j.clientKey,
        staffId: j.staffId,
        staffName: j.staffName,
        serviceName: j.serviceName,
        note: j.note,
        status: j.status,
        createdAt: j.createdAt.toISOString(),
        acceptedAt: j.acceptedAt?.toISOString() ?? null,
        startedAt: j.startedAt?.toISOString() ?? null,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Принять машину и отдать её мойщику. Только владелец: распределение
 * машин — его работа, и мойщик, назначающий машину сам себе, обесценил
 * бы очередь.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const input = (await body<Record<string, unknown>>(request)) ?? {};
    const clientKey = str(input.clientKey);
    const staffId = str(input.staffId);
    if (!clientKey || !staffId) return fail('BAD_REQUEST', 400);

    const job = await assignJob({
      tenantId: ctx.tenant.id,
      byUserId: ctx.user.id,
      clientKey,
      staffId,
      serviceId: str(input.serviceId) || null,
      note: str(input.note) || null,
    });

    return ok({
      job: {
        id: job.id,
        clientKey: job.clientKey,
        staffId: job.staffId,
        staffName: job.staffName,
        serviceName: job.serviceName,
        note: job.note,
        status: job.status,
        createdAt: job.createdAt.toISOString(),
        acceptedAt: null,
        startedAt: null,
      },
    });
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Двинуть наряд: взял или начал.
 *
 * Одним методом, а не двумя адресами: с точки зрения телефона это одно
 * действие «следующий шаг», и разводить его по путям значит заставлять
 * приложение помнить порядок состояний, который уже знает сервер.
 */
export async function PATCH(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request);
    if (denied(ctx)) return ctx;

    const input = (await body<Record<string, unknown>>(request)) ?? {};
    const id = str(input.id);
    const move = str(input.move);
    if (!id || !['accept', 'start', 'cancel'].includes(move)) return fail('BAD_REQUEST', 400);

    const owner = ctx.user.role === 'owner';

    /* Снять с очереди может только владелец: машина уехала, не
       дождавшись, — его решение, а не мойщика, которому просто не
       хочется её мыть. */
    if (move === 'cancel') {
      if (!owner) return fail('FORBIDDEN', 403);
      await cancelJob(ctx.tenant.id, id);
      return ok({ id, status: 'canceled' });
    }

    if (move === 'accept') await acceptJob(ctx.tenant.id, id, ctx.user.id, owner);
    else await startJob(ctx.tenant.id, id, ctx.user.id, owner);

    return ok({ id, status: move === 'accept' ? 'accepted' : 'started' });
  } catch (e) {
    return failFromError(e);
  }
}
