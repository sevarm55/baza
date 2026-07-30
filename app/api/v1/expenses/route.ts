import { ensureDb } from '@/lib/db/ready';
import { startOfDay } from '@/lib/queries';
import { addExpense, listExpenses, BadExpenseError, EXPENSE_HINTS } from '@/lib/expenses';
import { authorize, denied } from '@/lib/api/guard';
import { body, fail, failFromError, ok, str } from '@/lib/api/respond';

/**
 * Расходы бизнеса.
 *
 * Только владелец: мойщик записывает работу, а не решает, во сколько
 * обошлась химия. Читать их ему тоже незачем — из расходов виден
 * заработок хозяина.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const days = Number(new URL(request.url).searchParams.get('days') ?? 30);
    const safeDays = Number.isFinite(days) && days > 0 ? days : 30;
    const from = startOfDay(
      ctx.tenant.timezone,
      new Date(Date.now() - (safeDays - 1) * 86_400_000),
    );

    const rows = await listExpenses(ctx.tenant.id, from);

    return ok({
      hints: EXPENSE_HINTS,
      expenses: rows.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        note: e.note,
        monthly: e.monthly,
        at: e.at,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

export async function POST(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true, write: true });
    if (denied(ctx)) return ctx;

    const input = await body<{
      amount?: number;
      category?: string;
      note?: string;
      monthly?: boolean;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const row = await addExpense({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      amount: Number(input.amount),
      category: str(input.category),
      note: str(input.note),
      monthly: input.monthly === true,
      // с начала дня, а не с минуты заведения — см. app/actions.ts
      at: input.monthly === true ? startOfDay(ctx.tenant.timezone) : undefined,
    });

    return ok({ expense: { id: row.id } }, 201);
  } catch (e) {
    if (e instanceof BadExpenseError) return fail('BAD_REQUEST', 400);
    return failFromError(e);
  }
}
