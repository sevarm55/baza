import { ensureDb } from '@/lib/db/ready';
import { getPeriodStats, startOfDay } from '@/lib/queries';
import {
  addExpense,
  getPeriodCosts,
  listPeriodExpenses,
  BadExpenseError,
  EXPENSE_HINTS,
} from '@/lib/expenses';
import { windowFor } from '@/lib/summary-window';
import { authorize, denied } from '@/lib/api/guard';
import { pastDay } from '@/lib/time';
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

    /* Месяц целиком, а не скользящие тридцать дней.

       Скользящее окно давало десятого августа июльские траты в списке, и
       итог наверху складывал их как августовские. Владелец думает
       месяцами — так он платит аренду и так сверяется с прибылью, — и
       граница периода должна совпадать с той, которой он считает сам. */
    const month = new URL(request.url).searchParams.get('month') ?? 'current';
    const prev = month === 'prev';
    const period = windowFor(prev ? 'prevmonth' : 'month', ctx.tenant.timezone);

    const [rows, costs, stats] = await Promise.all([
      listPeriodExpenses(ctx.tenant.id, period.from, period.to, period.spread, {
        activeMonthlyOnly: !prev,
      }),
      getPeriodCosts(ctx.tenant.id, period.from, period.to, period.spread),
      /* Выручка нужна ради одного числа под итогом — доли расходов в
         ней. Сумма сама по себе не плохая и не хорошая: сто тысяч при
         выручке в миллион это обычный месяц, а при выручке в двести —
         беда. Кабинет показывает это же число и этой же функцией. */
      getPeriodStats(ctx.tenant.id, period.from, period.to),
    ]);

    return ok({
      hints: EXPENSE_HINTS,
      costs,
      revenue: stats.revenue,
      /* Средний расход в день — по прожитым дням периода, а не по длине
         месяца: пятого числа «в день» это пятая часть потраченного, а не
         тридцатая. Считает сервер, потому что «сколько дней прожито»
         знает только он: у закрытого месяца это его длина, у текущего —
         сегодняшнее число. */
      perDayAvg: period.days > 0 ? Math.round(costs.total / period.days) : 0,
      expenses: rows.map((e) => ({
        id: e.id,
        amount: e.amount,
        category: e.category,
        note: e.note,
        monthly: e.monthly,
        at: e.at,
        endedAt: e.endedAt,
        /* Во что эта строка обошлась за период. Постоянный расход
           платят раз в месяц, а живёт он каждый день: десятого числа от
           аренды набежала треть. Без этого числа «300 000» в списке
           читается как «я потратил триста тысяч». */
        share: e.share,
        perDay: e.monthly ? Math.round(e.amount / period.spread) : 0,
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
      at?: string;
    }>(request);
    if (!input) return fail('BAD_REQUEST', 400);

    const monthly = input.monthly === true;

    const row = await addExpense({
      tenantId: ctx.tenant.id,
      userId: ctx.user.id,
      amount: Number(input.amount),
      category: str(input.category),
      note: str(input.note),
      monthly,
      /* Постоянный — с начала дня, а не с минуты заведения (см.
         app/actions.ts). Разовый ложится тем днём, который выбрали:
         расходы заводят пачкой, за всю неделю сразу, и без этого вся
         неделя оказалась бы потрачена сегодня. */
      at: monthly
        ? startOfDay(ctx.tenant.timezone)
        : (pastDay(input.at, ctx.tenant.timezone) ?? undefined),
    });

    return ok({ expense: { id: row.id } }, 201);
  } catch (e) {
    if (e instanceof BadExpenseError) return fail('BAD_REQUEST', 400);
    return failFromError(e);
  }
}
