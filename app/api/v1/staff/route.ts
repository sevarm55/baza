import { ensureDb } from '@/lib/db/ready';
import { getPeriodStats, listStaff, startOfDay, startOfMonth } from '@/lib/queries';
import { getPayrollBoard } from '@/lib/payroll-board';
import { whoIsOnShift } from '@/lib/shifts';
import { addStaff, ValidationError } from '@/lib/catalog';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/** Кто работает в бизнесе. */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    /* Вместе с людьми — что каждый сделал за месяц.
       Список одних имён отвечает «кто заведён» и молчит о том, ради чего
       этих людей держат: за этим приходилось уходить на сводку и в
       зарплаты. Месяц, а не день: за один день «чего стоит человек» не
       видно.

       Смена и долг приходят отсюда же. Смена — вопрос про площадку и
       про «сейчас», а не про месяц; долг считает тот же лист, которым
       живут зарплаты (`getPayrollBoard`), а не отдельная формула:
       второй счёт долга разошёлся бы с ведомостью на первой же
       отменённой машине. */
    const [rows, month, present, board] = await Promise.all([
      listStaff(ctx.tenant.id),
      getPeriodStats(ctx.tenant.id, startOfMonth(ctx.tenant.timezone)),
      whoIsOnShift(ctx.tenant.id, startOfDay(ctx.tenant.timezone)),
      getPayrollBoard(ctx.tenant.id, ctx.tenant.timezone),
    ]);

    const worked = new Map(month.byStaff.map((s) => [s.staffId ?? '', s]));
    const onShift = new Map(present.map((p) => [p.userId, p.openedAt]));

    /* Отрицательный остаток — переплата за отменённую машину — в долг
       не превращается: она не требует действия. */
    const due = new Map<string, number>();
    for (const day of board.days) {
      for (const person of day.people) {
        if (!person.staffId || person.earned <= 0) continue;
        due.set(person.staffId, (due.get(person.staffId) ?? 0) + person.earned);
      }
    }

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
        cars: worked.get(u.id)?.count ?? 0,
        earned: worked.get(u.id)?.earned ?? 0,
        onShift: onShift.has(u.id),
        openedAt: onShift.get(u.id) ?? null,
        due: due.get(u.id) ?? 0,
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

    const user = await addStaff({
      tenantId: ctx.tenant.id,
      name: str(input.name),
      phone: str(input.phone),
      pin: str(input.pin),
      percent: Number(input.percent),
    });

    return ok(
      {
        staff: { id: user.id, name: user.name, phone: user.phone, percent: user.percent },
      },
      201,
    );
  } catch (e) {
    if (e instanceof ValidationError) {
      if (e.message === 'PHONE_TAKEN') return fail('PHONE_TAKEN', 409, { reason: e.message });
      return fail('BAD_REQUEST', 400, { reason: e.message });
    }
    return failFromError(e);
  }
}
