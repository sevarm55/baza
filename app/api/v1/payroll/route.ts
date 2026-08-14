import { ensureDb } from '@/lib/db/ready';
import {
  getSettledUntil,
  getUnsettledByDay,
  getUnsettledPayroll,
  listPayouts,
} from '@/lib/queries';
import { getPayrollBoard } from '@/lib/payroll-board';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/** К выплате сейчас и история уже выплаченного — весь экран зарплат. */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const [rows, byDay, settled, history, board] = await Promise.all([
      getUnsettledPayroll(ctx.tenant.id),
      getUnsettledByDay(ctx.tenant.id, ctx.tenant.timezone),
      getSettledUntil(ctx.tenant.id),
      listPayouts(ctx.tenant.id),
      getPayrollBoard(ctx.tenant.id, ctx.tenant.timezone),
    ]);

    return ok({
      /* `due` и `payouts` остаются как были — по ним живут приложения,
         выпущенные до дневного листа. Ответ дополняется, а не
         переписывается: обновление сервера не должно ломать телефон,
         который ещё не обновили из магазина. */
      due: rows.map((r) => ({
        staffId: r.staffId,
        name: r.name,
        percent: r.percent,
        /* Ставки, по которым сумма посчитана на самом деле. `percent`
           выше — текущая ставка человека, и после её изменения она
           перестаёт объяснять `earned`: деньги считаются по снимку в
           каждой записи. Приложению показывать надо эти две, а вилку
           `pctFrom–pctTo` — когда они разошлись. */
        pctFrom: r.pctFrom,
        pctTo: r.pctTo,
        count: r.count,
        revenue: r.revenue,
        earned: r.earned,
        // с какого момента копится: владелец должен видеть период, а не только сумму
        since: r.staffId ? (settled.get(r.staffId)?.toISOString() ?? null) : null,
        /* Разбивка по дням. Одна растущая сумма не читается: владелец
           не понимает, за сегодня она или за неделю. */
        days: byDay
          .filter((d) => d.staffId === r.staffId)
          .map((d) => ({ day: d.day, count: d.count, revenue: d.revenue, earned: d.earned })),
      })),
      payouts: history,

      /* Лист по рабочим дням — то же самое, что показывает кабинет, и
         посчитанное тем же кодом. Разница с `due` не в оформлении:
         там сумма по человеку с границей «всё, что раньше последней
         выплаты», здесь — остаток по каждому дню отдельно, вместе с
         тем, что за этот день уже отдано и когда.

         Итог `totals.outstanding` складывается из показанных дней,
         поэтому сходится со строками на экране. */
      board: {
        days: board.days.map((d) => ({
          day: d.day,
          units: d.units,
          outstanding: d.outstanding,
          paid: d.paid,
          people: d.people.map((p) => ({
            staffId: p.staffId,
            name: p.name,
            count: p.count,
            earned: p.earned,
            paid: p.paid,
            paidAt: p.paidAt?.toISOString() ?? null,
            pctFrom: p.pctFrom,
            pctTo: p.pctTo,
            /* Пусто, когда полного разложения нет: половина машин под
               суммой хуже, чем ни одной — она читается как полная и не
               сходится. */
            lines: p.lines,
          })),
        })),
        /* Выдачи: одна операция — одна запись, сколько бы человек в ней
           ни было. `day` — за какой рабочий день; у старых выплат его
           нет, и тогда остаются границы отрезка. */
        payments: board.payments.map((p) => ({
          key: p.key,
          paidAt: p.paidAt.toISOString(),
          day: p.day,
          periodFrom: p.periodFrom.toISOString(),
          periodTo: p.periodTo.toISOString(),
          units: p.units,
          total: p.total,
          rows: p.rows,
        })),
        totals: board.totals,
        lastPaidAt: board.lastPaidAt?.toISOString() ?? null,
      },
    });
  } catch (e) {
    return failFromError(e);
  }
}
