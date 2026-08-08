import { ensureDb } from '@/lib/db/ready';
import { listStaff } from '@/lib/queries';
import { addStaff, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/** Кто работает в бизнесе. */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const rows = await listStaff(ctx.tenant.id);
    return ok({
      staff: rows.map((u) => ({
        id: u.id,
        name: u.name,
        phone: u.phone,
        role: u.role,
        percent: u.percent,
        // себя владелец отключить не может — приложение не должно даже
        // показывать такую кнопку
        isMe: u.id === ctx.user.id,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

/**
 * Завести сотрудника.
 *
 * PIN приходит от владельца и хешируется здесь же: сотрудник войдёт
 * своим телефоном и этим кодом. Отдавать PIN обратно наружу нельзя —
 * ни в этом ответе, ни в каком другом.
 */
export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{
      name?: string;
      phone?: string;
      pin?: string;
      percent?: number;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const { row: user, attached } = await addStaff({
      tenantId: ctx.tenant.id,
      name: str(input.name),
      phone: str(input.phone),
      pin: str(input.pin),
      percent: Number(input.percent),
    });

    return ok(
      {
        staff: { id: user.id, name: user.name, phone: user.phone, percent: user.percent },
        /* Человек уже пользовался Tetrin — код у него свой, и назначенный
           владельцем не подойдёт. Приложению это нужно, чтобы сказать
           «войдёт своим кодом» вместо «код 1234». */
        attached,
      },
      201,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      if (e.message === 'PHONE_TAKEN') return fail('PHONE_TAKEN', 409, { reason: e.message });
      if (e.message === 'ALREADY_IN_BUSINESS') {
        return fail('ALREADY_IN_BUSINESS', 409, { reason: e.message });
      }
      return fail('BAD_REQUEST', 400, { reason: e.message });
    }
    return failFromError(e);
  }
}
