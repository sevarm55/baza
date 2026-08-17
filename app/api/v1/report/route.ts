import { ensureDb } from '@/lib/db/ready';
import { getPaymentSplit } from '@/lib/queries';
import { daysInMonthOf } from '@/lib/time';
import {
  getCostsByCategory,
  getEarnedByService,
  getMonthBase,
  getMonthlyReport,
} from '@/lib/reports';
import { authorize, denied } from '@/lib/api/guard';
import { failFromError, ok } from '@/lib/api/respond';

/**
 * Отчёт по месяцам — весь экран одним запросом.
 *
 * ЗАЧЕМ ЭТОТ МАРШРУТ. Сводка отвечает «сколько сегодня» и «сколько за
 * месяц», и приложению этого хватало ровно до вопроса «стало лучше или
 * хуже, и почему». Разрезы — откуда пришли деньги, куда ушли, кто это
 * сделал, как месяц смотрится на фоне соседних — были только в кабинете.
 *
 * Считает всё тот же код, которым живёт `/owner/reports`. Ни одного
 * второго счёта здесь нет и быть не должно: отчёт, расходящийся с
 * кабинетом хотя бы на драм, не читают вовсе.
 *
 * Месяц выбирается номером назад от текущего (`back=0` — этот, `1` —
 * прошлый), а не строкой `YYYY-MM`. Причина в том, что `getMonthlyReport`
 * уже считает ряд последних месяцев одним проходом: попросив строку, мы
 * заставили бы его считать ряд заново от другой точки — и границы месяца
 * поехали бы относительно тех, по которым нарисован сам ряд.
 */

/** Сколько месяцев показываем. То же число, что в кабинете. */
const MONTHS = 6;

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const months = await getMonthlyReport(ctx.tenant.id, ctx.tenant.timezone, MONTHS);

    /* Месяцы до первой работы отрезаются — те же правила, что в
       кабинете. Бизнесу может быть два месяца, а окно шесть, и четыре
       из них рисовались бы нулями: это не нули мойки, а месяцы, когда
       мойки ещё не было. Один месяц остаётся всегда. */
    const idle = (m: (typeof months)[number]) =>
      m.count === 0 && m.revenue === 0 && m.costs === 0;
    let oldest = months.length - 1;
    while (oldest > 0 && idle(months[oldest])) oldest--;
    const shown = months.slice(0, oldest + 1);

    const asked = Number(new URL(request.url).searchParams.get('back') ?? 0);
    const index = Number.isInteger(asked) && asked >= 0 && asked < shown.length ? asked : 0;
    const current = shown[index];

    const [costs, earned, split, base] = await Promise.all([
      getCostsByCategory(
        ctx.tenant.id,
        current.from,
        current.to,
        daysInMonthOf(ctx.tenant.timezone, current.from),
      ),
      getEarnedByService(ctx.tenant.id, current.from, current.to),
      getPaymentSplit(ctx.tenant.id, current.from, current.to),
      getMonthBase(ctx.tenant.id, ctx.tenant.timezone, current),
    ]);

    return ok({
      /* Ряд месяцев целиком: по нему приложение рисует и выбор месяца, и
         сравнение соседних. Отдаём вместе с разрезом открытого месяца,
         а не отдельным запросом, — экран один, и два round-trip по
         мобильной сети либо задержат его, либо оборвутся. */
      months: shown.map((m, i) => ({
        back: i,
        from: m.from.toISOString(),
        to: m.to.toISOString(),
        count: m.count,
        revenue: m.revenue,
        payroll: m.payroll,
        costs: m.costs,
        discounts: m.discounts,
        avgCheck: m.avgCheck,
        profit: m.profit,
        kept: m.kept,
      })),
      current: {
        back: index,
        from: current.from.toISOString(),
        to: current.to.toISOString(),
        count: current.count,
        revenue: current.revenue,
        payroll: current.payroll,
        costs: current.costs,
        oneOff: current.oneOff,
        monthlyShare: current.monthlyShare,
        discounts: current.discounts,
        avgCheck: current.avgCheck,
        profit: current.profit,
        kept: current.kept,
        byStaff: current.byStaff,
      },
      /* С чем сравниваем: тот же отрезок предыдущего месяца, обрезанный
         по прожитому времени. Пусто у самого старого месяца — базы у
         него нет, и клиент в этом случае молчит, а не рисует «+100 %»
         от пустоты. */
      base: base && { revenue: base.revenue, profit: base.profit },
      services: earned,
      costsByCategory: costs,
      split,
    });
  } catch (e) {
    return failFromError(e);
  }
}
