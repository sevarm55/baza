import { ensureDb } from '@/lib/db/ready';
import { getSettledUntil, getUnsettledPayroll, listPayouts } from '@/lib/queries';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/** К выплате сейчас и история уже выплаченного — весь экран зарплат. */
export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const [rows, settled, history] = await Promise.all([
      getUnsettledPayroll(ctx.tenant.id),
      getSettledUntil(ctx.tenant.id),
      listPayouts(ctx.tenant.id),
    ]);

    return ok({
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
      })),
      payouts: history,
    });
  } catch (e) {
    return failFromError(e);
  }
}
