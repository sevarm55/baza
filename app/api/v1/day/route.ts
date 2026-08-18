import { ensureDb } from '@/lib/db/ready';
import { getFeed, getPeriodStats } from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { daysInMonthOf } from '@/lib/time';
import { shiftsOnDay } from '@/lib/shifts';
import { dayBounds, isDate } from '@/lib/history';
import { authorize, denied } from '@/lib/api/guard';
import { fail, failFromError, ok } from '@/lib/api/respond';

/**
 * Один день целиком.
 *
 * Отвечает на вопрос, ради которого история и заводилась: кто стоял на
 * смене, кто что помыл, сколько вышло. Смены отдельно от записей —
 * человек мог отстоять день и не намыть ничего, и по одним записям этого
 * не увидеть.
 */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const asked = new URL(request.url).searchParams.get('date') ?? '';
    if (!isDate(asked)) return fail('BAD_REQUEST', 400);

    const { from, to } = dayBounds(asked, ctx.tenant.timezone);

    const [stats, feed, crew, costs] = await Promise.all([
      getPeriodStats(ctx.tenant.id, from, to),
      getFeed(ctx.tenant.id, from, 200, to),
      shiftsOnDay(ctx.tenant.id, from, to),
      // тот же знаменатель, что у сводки и календаря: длина месяца, в
      // котором стоит этот день
      getPeriodCosts(ctx.tenant.id, from, to, daysInMonthOf(ctx.tenant.timezone, from)),
    ]);

    return ok({
      date: asked,
      stats,
      costs,
      profit: profitOf(stats.revenue, stats.payroll, costs),
      shifts: crew.map((s) => ({
        userId: s.userId,
        name: s.name,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        // сколько наличных намыл и сколько сдал; null — не отмечал
        cashExpected: s.cashExpected,
        cashDeclared: s.cashDeclared,
      })),
      feed: feed.map((o) => ({
        id: o.id,
        clientKey: o.clientKey,
        serviceName: o.serviceName,
        // кто внёс запись; кто над ней работал — в `crew`
        staffName: o.staffName,
        // ставка на всю запись: у совместной мойки это процент команды
        staffPercent: o.staffPercent,
        // состав работы и доля каждого; у одиночной мойки один человек
        crew: o.crew,
        price: o.price,
        // прайс рядом со взятым — только когда взяли меньше
        listPrice: o.listPrice !== null && o.listPrice > o.price ? o.listPrice : null,
        payment: o.payment,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}
