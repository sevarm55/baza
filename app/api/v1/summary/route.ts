import { ensureDb } from '@/lib/db/ready';
import { padSeries } from '@/lib/series';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  startOfDay,
} from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { authorize, denied } from '@/lib/api/guard';
import { getSetup } from '@/lib/onboarding';
import { failFromError, ok } from '@/lib/api/respond';
import { asPeriod, windowFor } from '@/lib/summary-window';

/**
 * Сводка владельца за период — весь экран одним запросом.
 *
 * В вебе это четыре независимых запроса, и там это правильно: они уходят
 * параллельно внутри одного рендера. Приложению так нельзя — четыре
 * round-trip по мобильной сети складываются в заметную паузу, а часть из
 * них ещё и оборвётся.
 *
 * Период задаётся теми же ключами, что и вкладки в кабинете: today,
 * month, prevmonth. Чужое или пустое значение молча читается как «сегодня».
 * Границы и база сравнения считаются в `lib/summary-window.ts` — теми же,
 * что и в вебе, иначе сайт и приложение показали бы разные деньги за один
 * и тот же день.
 */

export async function GET(request: Request) {
  try {
    await ensureDb();
    const ctx = await authorize(request, { owner: true });
    if (denied(ctx)) return ctx;

    const period = asPeriod(new URL(request.url).searchParams.get('period'));
    const w = windowFor(period, ctx.tenant.timezone);
    const { byHour, from, to, prevFrom, prevTo } = w;

    /* Кто на смене — всегда «сейчас», независимо от выбранного периода:
       вопрос «кто на мойке» к семи дням отношения не имеет. Поэтому
       считаем от начала сегодняшнего дня, а не от `from`. */
    const today = startOfDay(ctx.tenant.timezone);

    /* Число без опоры ничего не значит: «прибыль 11 144» — это хорошо
       или плохо? Владелец помнит вчерашнюю выручку, но не вчерашнюю
       прибыль, её никто в уме не считает. С чем именно сравнивать каждый
       период — решено в `windowFor`. */

    /* Состояние настройки едет вместе со сводкой, а не отдельным
       запросом. Причина та же, по которой сводка вообще одна: экран
       владельца обновляют потягиванием вниз, и второй round-trip по
       мобильной сети либо задержит его, либо оборвётся — и «Начало
       работы» разойдётся с числами на том же экране.

       Считается тем же кодом, что в вебе (`lib/onboarding.ts`), по
       данным бизнеса, а не по нажатиям. Тому, кто блок убрал, это не
       стоит ни одного запроса к базе. */
    const [stats, series, split, feed, costs, present, prevStats, prevCosts, setup] =
      await Promise.all([
      getPeriodStats(ctx.tenant.id, from, to),
      getRevenueSeries(ctx.tenant.id, from, ctx.tenant.timezone, byHour ? 'hour' : 'day', to),
      getPaymentSplit(ctx.tenant.id, from, to),
      getFeed(ctx.tenant.id, from),
      getPeriodCosts(ctx.tenant.id, from, to, w.spread),
      whoIsOnShift(ctx.tenant.id, today),
      getPeriodStats(ctx.tenant.id, prevFrom, prevTo),
      getPeriodCosts(ctx.tenant.id, prevFrom, prevTo, w.spread),
      getSetup(ctx.tenant, ctx.user),
    ]);

    return ok({
      period,
      /* Настройка первого дня. `visible: false` — блока нет, и клиенту
         этого достаточно: разбираться, почему именно (убрали руками или
         мойка уже работает), ему незачем. */
      setup: {
        visible: setup.visible,
        complete: setup.complete,
        done: setup.done,
        total: setup.total,
        /* Ключами, а не подписями: слова у приложения свои, и присылать
           ему готовую армянскую строку значит навсегда лишить его
           возможности показать её по-другому — то же правило, что у
           кодов ошибок в lib/api/respond.ts. */
        steps: setup.steps.map((step) => ({ key: step.key, done: step.done })),
        next: setup.next?.key ?? null,
      },
      from: from.toISOString(),
      /* Границы отдаются обеими сторонами: подпись под вкладкой должна
         называть даты. «К прошлому периоду» без дат не сообщает ничего —
         человеку надо видеть, что сравнили 1–7 августа с 1–7 июля. */
      to: to.toISOString(),
      stats,
      costs,
      /* Прибыль считаем на сервере, а не в приложении: формула одна на
         все клиенты, и разъехаться между телефоном и кабинетом она не
         должна — это та цифра, из-за которой продукту верят. */
      profit: profitOf(stats.revenue, stats.payroll, costs),
      /* Прошлый отрезок — только две цифры: больше на экране всё равно не
         показать, а тащить целый второй набор ради этого незачем. */
      previous: {
        from: prevFrom.toISOString(),
        to: prevTo.toISOString(),
        revenue: prevStats.revenue,
        profit: profitOf(prevStats.revenue, prevStats.payroll, prevCosts),
        /* Пусто — значит сравнивать не с чем: бизнес завёлся на этой
           неделе, прошлого месяца у него не было. Клиент в этом случае
           молчит, а не рисует «+100%» от нуля. */
        count: prevStats.count,
      },
      onShift: present.map((p) => ({
        userId: p.userId,
        name: p.name,
        openedAt: p.openedAt,
      })),
      series: padSeries(series, byHour, ctx.tenant.timezone, from, to),
      split,
      feed: feed.map((o) => ({
        id: o.id,
        clientKey: o.clientKey,
        serviceName: o.serviceName,
        /* Кто ВНЁС запись. Кто над ней работал — в `crew` ниже: у
           совместной мойки это разные вопросы и часто разные ответы. */
        staffName: o.staffName,
        /* Ставка, применённая ко всей записи. У одиночной мойки это
           процент исполнителя, как и раньше; у совместной — процент
           команды, то есть весь зарплатный фонд машины. Доля бизнеса
           («осталось») по нему считается верно в обоих случаях. */
        staffPercent: o.staffPercent,
        /* Состав работы и доля каждого. У одиночной мойки ровно один
           человек, и приложение рисует его как рисовало. */
        crew: o.crew,
        price: o.price,
        /* Прайс — только когда взяли меньше. Скидка обязана быть видна
           там, где владелец читает работу: до сих пор она была видна
           только в push в момент записи. */
        listPrice: o.listPrice !== null && o.listPrice > o.price ? o.listPrice : null,
        payment: o.payment,
        createdAt: o.createdAt,
      })),
    });
  } catch (e) {
    return failFromError(e);
  }
}

