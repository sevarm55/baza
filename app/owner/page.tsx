import { redirect } from 'next/navigation';

import { requireOwner } from '@/lib/auth';
import { getDict } from '@/lib/i18n/server';
import { localizeTenantOrNull, serviceNameTerm, unitCount, staffCount } from '@/lib/i18n/terms';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  getTenant,
  getUser,
  listStaff,
  startOfDay,
} from '@/lib/queries';
import { windowFor } from '@/lib/summary-window';
import { hhmm, ymd } from '@/lib/time';
import { formatMoney, staffShare } from '@/lib/money';
import { passesEnabled } from '@/lib/features';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { shiftsOnDay, whoIsOnShift } from '@/lib/shifts';
import { countActivity, listActivity, type ActivityType } from '@/lib/activity';
import { LiveActivity } from '@/components/patterns/live-activity';
import { DesktopOnly, MobileOnly, MobileSegmentedLinks } from '@/components/mobile';
import { Attention, type Signal } from './today/attention';
import { personColor } from '@/lib/person-color';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel, PanelGrid } from '@/components/patterns/panel';
import { Delta, Metric, MetricStrip } from '@/components/patterns/metric';
import { NowMark } from '@/components/patterns/now-mark';
import { ErrorState } from '@/components/patterns/error-state';
import { getPeriod } from './periods';
import { PeriodTabs } from './period-tabs';
import { FlowChart } from './today/flow-chart';
import { CrewPanel } from './today/crew-panel';
import { PaymentMix } from './today/payment-mix';
import { Journal } from './today/journal';
import { TodayMobile } from './today/mobile';
import { periods, periodHref } from './periods';
import type { CrewMember, FlowPoint, MixSlice, Op } from './today/model';

/**
 * Сводка: главный экран владельца.
 *
 * Отвечает на один вопрос: что происходит в бизнесе сегодня (или за
 * выбранный месяц), в том порядке, в каком его задают:
 *
 *   1. сколько мне остаётся        → первое показание полосы;
 *   2. из чего это сложилось       → три показания рядом;
 *   3. как шёл день                → график;
 *   4. кто работает и чем платили  → колонка справа;
 *   5. что именно было             → журнал.
 *
 * Ни одно число не показано дважды. Считает не эта страница: выручка,
 * зарплата и расходы приходят из `getPeriodStats` и `getPeriodCosts`,
 * прибыль из `profitOf`; тот же код отвечает приложению в
 * `/api/v1/summary`, и разъехаться им нельзя.
 */

/* Цвета способов оплаты: через переменные темы, а не хексами. */
const PAYMENT_COLORS: Record<string, string> = {
  cash: 'var(--success)',
  card: 'var(--chart-1)',
  transfer: 'var(--chart-3)',
  pass: 'var(--warning)',
};

/** Предел ленты: сводка не архив, а сегодняшний день. */
const FEED_LIMIT = 100;

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  /* Слова бизнеса на языке того, кто смотрит; копия уходит только на
     экран, в базу отсюда ничего не пишется. */
  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');

  const { p } = await searchParams;
  const period = getPeriod(p);
  const isToday = period === 'today';

  /* Границы и база сравнения считаются там же, где для приложения. */
  const w = windowFor(period, tenant.timezone);
  const { byHour, from, to, prevFrom, prevTo } = w;

  const dayStart = startOfDay(tenant.timezone);
  const [stats, feed, series, split, costs, prevStats, prevCosts, roster, activity, counts, dayShifts] =
    await Promise.all([
      getPeriodStats(tenant.id, from, to),
      getFeed(tenant.id, from, FEED_LIMIT, to),
      /* Единственный запрос, которому позволено не доехать: без графика
         страница отвечает на все вопросы, кроме «когда был заезд». */
      getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day', to).catch(
        () => null,
      ),
      getPaymentSplit(tenant.id, from, to),
      getPeriodCosts(tenant.id, from, to, w.spread),
      getPeriodStats(tenant.id, prevFrom, prevTo),
      getPeriodCosts(tenant.id, prevFrom, prevTo, w.spread),
      listStaff(tenant.id),
      /* Живая лента: всегда «сейчас», как и люди на смене. Падение
         ленты не роняет сводку: без неё страница отвечает на всё,
         кроме «что происходит прямо сейчас». */
      listActivity(tenant.id, { from: dayStart, limit: 30 }).catch(() => []),
      countActivity(tenant.id, dayStart).catch((): Partial<Record<ActivityType, number>> => ({})),
      shiftsOnDay(tenant.id, dayStart, new Date(dayStart.getTime() + 86_400_000)).catch(() => []),
    ]);

  /* Кто на смене: «сейчас», без оглядки на выбранный период. */
  const present = await whoIsOnShift(tenant.id, dayStart);
  const presentIds = new Set(present.map((x) => x.userId));

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const profit = profitOf(stats.revenue, stats.payroll, costs);
  const prevProfit = profitOf(prevStats.revenue, prevStats.payroll, prevCosts);
  const diff = profit - prevProfit;

  /* Список людей объединённый: сначала те, кто на смене, потом
     отработавшие; внутри по заработку. */
  const crew: CrewMember[] = [
    ...present.map((x) => {
      const worked = stats.byStaff.find((s) => s.staffId === x.userId);
      return {
        staffId: x.userId,
        name: x.name,
        color: personColor(x.name),
        present: true,
        since: hhmm(x.openedAt, tenant.timezone),
        count: worked?.count ?? 0,
        earned: worked?.earned ?? 0,
      };
    }),
    ...stats.byStaff
      .filter((s) => !s.staffId || !presentIds.has(s.staffId))
      .map((s) => ({
        staffId: s.staffId,
        name: s.name ?? '—',
        color: personColor(s.name),
        present: false,
        since: null,
        count: s.count,
        earned: s.earned,
      })),
  ].sort((a, b) => Number(b.present) - Number(a.present) || b.earned - a.earned);

  /* Записи приезжают в браузер уже посчитанными: доля из снимка
     процента в самой записи, остаток бизнеса после неё. */
  const ops: Op[] = feed.map((o) => {
    const share = o.staffPercent > 0 ? staffShare(o.price, o.staffPercent) : 0;
    return {
      id: o.id,
      time: hhmm(o.createdAt, tenant.timezone),
      clientKey: o.clientKey,
      crew: o.crew.map((p) => ({
        staffId: p.staffId,
        name: p.name,
        color: personColor(p.name),
        earned: p.earned,
      })),
      authorName: o.staffName,
      serviceName: serviceNameTerm(o.serviceName, t.locale),
      payment: o.payment,
      paymentLabel: paymentLabel(o.payment, t),
      price: o.price,
      listPrice: o.listPrice !== null && o.listPrice > o.price ? o.listPrice : null,
      percent: o.staffPercent,
      share,
      yours: o.price - share,
    };
  });

  /* Способы оплаты: только те, что реально встретились. */
  const paid = split.filter((x) => (passesEnabled() || x.payment !== 'pass') && x.revenue > 0);
  const mixTotal = paid.reduce((sum, x) => sum + x.revenue, 0);
  const mix: MixSlice[] = paid
    .sort((a, b) => b.revenue - a.revenue)
    .map((x) => ({
      key: x.payment,
      label: paymentLabel(x.payment, t),
      value: x.revenue,
      share: mixTotal > 0 ? Math.round((x.revenue / mixTotal) * 100) : 0,
      color: PAYMENT_COLORS[x.payment] ?? 'var(--chart-4)',
    }));

  /* Кнопки фильтра журнала: по тем же способам и в том же порядке. */
  const methods = mix
    .filter((m) => ops.some((o) => o.payment === m.key))
    .map((m) => ({ key: m.key, label: m.label }));

  /* Что необычного сегодня. Считается по сегодняшним данным, на каком
     бы периоде ни стояла сводка: необычное это про «сейчас». */
  const signals: Signal[] = [];
  if (isToday) {
    if (stats.discounts > 0) {
      signals.push({
        key: 'discounts',
        tone: 'neutral',
        icon: 'discount',
        text: t.today.attentionDiscounts(money(stats.discounts)),
        href: '/owner/activity?g=cars',
      });
    }
    const canceled = counts['car.canceled'] ?? 0;
    if (canceled > 0) {
      signals.push({
        key: 'canceled',
        tone: 'warning',
        icon: 'cancel',
        text: t.today.attentionCanceled(canceled),
        href: '/owner/activity?g=cars',
      });
    }
    for (const sh of dayShifts) {
      if (!sh.closedAt || sh.cashExpected === null || sh.cashExpected === 0) continue;
      if (sh.cashDeclared === null) {
        signals.push({
          key: `cash-${sh.userId}`,
          tone: 'warning',
          icon: 'cash',
          text: t.today.attentionCashNotDeclared(sh.name),
          href: '/owner/activity?g=shifts',
        });
      } else if (sh.cashDeclared !== sh.cashExpected) {
        const diff = sh.cashDeclared - sh.cashExpected;
        signals.push({
          key: `cash-${sh.userId}`,
          tone: diff < 0 ? 'danger' : 'warning',
          icon: 'cash',
          text: t.today.attentionCash(sh.name, `${diff > 0 ? '+' : '−'}${money(Math.abs(diff))}`),
          href: '/owner/activity?g=shifts',
        });
      }
    }
    const hour = Number(
      new Intl.DateTimeFormat('en-GB', { timeZone: tenant.timezone, hour: '2-digit', hourCycle: 'h23' }).format(new Date()),
    );
    if (present.length === 0 && roster.length > 0 && hour >= 9 && hour < 20) {
      signals.push({
        key: 'nobody',
        tone: 'warning',
        icon: 'nobody',
        text: t.today.attentionNobody,
        href: '/owner/staff',
      });
    }
  }

  const flow =
    series &&
    buildFlow(series, feed, byHour, from, w.days, tenant.timezone, {
      namesComplete: feed.length < FEED_LIMIT,
    });

  const dayLabel = periodDates(from, to, tenant.timezone, byHour, t.locale);

  /* Сравнение с прошлым отрезком: подпись к показанию, не показание. */
  const compare = (
    <Delta
      value={prevStats.count === 0 ? null : diff}
      formatted={money(Math.abs(diff))}
      noBase={t.owner.noBase}
    />
  );
  const compareLong = (
    <Delta
      value={prevStats.count === 0 ? null : diff}
      formatted={money(Math.abs(diff))}
      noBase={t.owner.noBase}
      suffix={isToday ? t.owner.vsLastWeek : t.owner.vsPrev}
    />
  );

  const chart = flow ? (
    <FlowChart points={flow} currency={tenant.currency} unitOne={tenant.unitOne} byHour={byHour} />
  ) : (
    <ErrorState
      compact
      title={t.today.flowFailed}
      onRetry={undefined}
    />
  );

  const costsHint = [
    costs.oneOff > 0 ? `${t.expenses.oneOffs} ${money(costs.oneOff)}` : null,
    costs.monthlyShare > 0 ? `${t.expenses.monthlyAccrued} ${money(costs.monthlyShare)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const journalNote =
    feed.length >= FEED_LIMIT ? t.today.lastRecords(feed.length) : t.today.workAll(dayLabel);

  return (
    /* Одна колонка на оба представления, и журнал в ней ровно один: он
       сам знает, каким быть на телефоне и каким на компьютере, а место
       у него в обоих случаях одно — последнее. */
    <div className="flex flex-col gap-5 max-md:gap-3">
      {/* Телефон получает композицию приложения: показание по оси
          экрана, строка вычитания под ним, факты строкой, люди лентой,
          журнал строками. Данные те же — их посчитал этот же серверный
          компонент выше, и разойтись двум представлениям негде. */}
      <MobileOnly className="flex flex-col gap-3">
        {/* Период прилипает под шапкой: на него смотрят, дочитав экран
            до низа, и возвращаться за ним наверх не должны. */}
        <div
          className="sticky z-20 -mx-4 bg-m-board/92 px-4 pt-1 pb-2 backdrop-blur-xl"
          style={{ top: 'calc(var(--m-safe-top) + var(--m-top-h))' }}
        >
          <MobileSegmentedLinks
            current={period}
            label={t.owner.periodLabel}
            items={periods(t).map((x) => ({
              key: x.key,
              label: x.label,
              href: periodHref(x.key),
            }))}
          />
        </div>

        <TodayMobile
          isToday={isToday}
          dayLabel={dayLabel}
          profit={profit}
          revenue={stats.revenue}
          payroll={stats.payroll}
          costsTotal={costs.total}
          count={stats.count}
          avgCheck={stats.avgCheck}
          diff={diff}
          hasBase={prevStats.count > 0}
          crew={crew}
          presentCount={present.length}
          mix={mix}
          flow={flow ?? null}
          signals={signals}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
        />
      </MobileOnly>

      <DesktopOnly display="contents">
      <PageHeader
        className="mb-0"
        title={t.owner.tabToday}
        meta={
          <>
            <span>{dayLabel}</span>
            {isToday && (
              <>
                <span aria-hidden>·</span>
                <NowMark
                  initial={hhmm(new Date(), tenant.timezone)}
                  timezone={tenant.timezone}
                  label={t.today.nowMark}
                />
              </>
            )}
          </>
        }
        actions={<PeriodTabs current={period} />}
      />

      <MetricStrip columns={4}>
        <Metric
          size="lg"
          label={profit >= 0 ? t.owner.profit : t.owner.inTheRed}
          value={money(Math.abs(profit))}
          tone={profit < 0 ? 'destructive' : 'default'}
          delta={compare}
          hint={
            stats.revenue > 0 && profit >= 0
              ? `${Math.round((profit / stats.revenue) * 100)}% ${t.owner.kept}`
              : undefined
          }
        />
        <Metric
          label={t.owner.revenue}
          value={money(stats.revenue)}
          hint={
            <>
              {unitCount(stats.count, tenant.unitOne, t.locale)}
              {stats.avgCheck > 0 && ` · ${t.owner.avgCheck} ${money(stats.avgCheck)}`}
            </>
          }
        />
        <Metric
          label={t.owner.payrollAccrued}
          value={stats.payroll > 0 ? `−${money(stats.payroll)}` : money(0)}
          hint={staffCount(isToday ? present.length : crew.length, tenant.staffRole, t.locale) + (isToday ? ` ${t.owner.onShift.toLocaleLowerCase(t.locale)}` : '')}
        />
        <Metric
          label={t.owner.costs}
          value={costs.total > 0 ? `−${money(costs.total)}` : money(0)}
          hint={costsHint || undefined}
        />
      </MetricStrip>

      <Attention signals={signals} />

      {/* Кто работает и что происходит: операционная картина идёт сразу
          за деньгами, потому что за ней владелец и открывает сводку днём.
          Ниже ход дня и способы оплаты: это уже «как сложилось». */}
      <PanelGrid>
        <CrewPanel
          className="lg:col-span-4"
          crew={crew}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
          title={isToday ? t.today.nowWorking : t.settings.staff}
        />
        <LiveActivity
          className="lg:col-span-8"
          initial={activity}
          currency={tenant.currency}
          timezone={tenant.timezone}
        />

        <Panel
          className="lg:col-span-8"
          title={byHour ? t.today.flowDay : t.today.flowPeriod}
          actions={compareLong}
        >
          {chart}
        </Panel>
        <PaymentMix className="lg:col-span-4" slices={mix} currency={tenant.currency} />
      </PanelGrid>

      </DesktopOnly>

      {/* Журнал общий: он сам знает, каким быть на телефоне и каким на
          компьютере, и стоит в разметке ровно один раз. */}
      <Journal
        ops={ops}
        staff={roster.map((s) => ({ id: s.id, name: s.name }))}
        teamPercent={tenant.teamPercent}
        currency={tenant.currency}
        unitOne={tenant.unitOne}
        staffRole={tenant.staffRole}
        clientIdLabel={tenant.clientIdLabel}
        title={isToday ? t.today.work : t.owner.feed}
        note={journalNote}
        empty={
          isToday
            ? { title: t.owner.emptyToday, note: t.today.emptyNote }
            : { title: t.today.noRecords }
        }
        methods={methods}
      />
    </div>
  );
}

/**
 * «1 օգոստոսի» или «1 — 7 օգոստոսի».
 *
 * Верхняя граница берётся из окна, а не из «сегодня»: у прошлого месяца
 * период закончился, и подписывать его сегодняшним числом — врать.
 */
function periodDates(
  from: Date,
  to: Date,
  timezone: string,
  single: boolean,
  locale: string,
): string {
  const f = new Intl.DateTimeFormat(intlLocale(locale), {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  });
  if (single) return f.format(from);

  // верхняя граница — начало следующих суток, поэтому день назад
  const last = new Date(Math.min(to.getTime(), Date.now()) - 1);
  const day = new Intl.DateTimeFormat(intlLocale(locale), { day: 'numeric', timeZone: timezone });
  const sameMonth =
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(from) ===
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(last);

  // «1 — 7 օգոստոսի» вместо «1 օգոստոսի — 7 օգոստոսի»: месяц один, и
  // повторять его дважды значит забрать место у цифр
  return sameMonth ? `${day.format(from)} — ${f.format(last)}` : `${f.format(from)} — ${f.format(last)}`;
}

/**
 * Отрезки графика: деньги, машины и кто их мыл.
 *
 * Пустые часы и дни достраиваются. Без этого график врёт: три записи
 * подряд в 9, 14 и 19 нарисуются тремя соседними столбиками, и провала
 * между ними не будет видно — а он и есть самое интересное.
 *
 * Числа берутся из базы, имена — из ленты. Разделение не случайное:
 * база считает весь период, лента ограничена сверху, и подписать час
 * именами из обрезанной ленты значило бы показать «мыл Валод» там, где
 * рядом с ним работал ещё один человек, просто не доехавший до экрана.
 */
function buildFlow(
  series: { key: string; revenue: number; count: number }[],
  feed: { createdAt: Date; staffName: string | null }[],
  byHour: boolean,
  from: Date,
  days: number,
  timezone: string,
  { namesComplete }: { namesComplete: boolean },
): FlowPoint[] {
  const found = new Map(series.map((s) => [s.key, s]));

  /* Имена по тем же отрезкам, что и числа. Ключ собирается из времени
     записи в поясе бизнеса — тем же разбором, каким его собрала база. */
  const people = new Map<string, string[]>();
  if (namesComplete) {
    for (const o of feed) {
      const iso = ymd(o.createdAt, timezone);
      const key = byHour ? `${iso} ${hhmm(o.createdAt, timezone).slice(0, 2)}` : `${iso} 00`;
      const names = people.get(key) ?? [];
      if (o.staffName && !names.includes(o.staffName)) names.push(o.staffName);
      people.set(key, names);
    }
  }

  const at = (key: string, label: string): FlowPoint => ({
    label,
    value: found.get(key)?.revenue ?? 0,
    count: found.get(key)?.count ?? 0,
    // трёх имён достаточно: строка под графиком не абзац
    people: (people.get(key) ?? []).slice(0, 3),
  });

  const ymdIn = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  if (byHour) {
    const hours = series.map((s) => Number(s.key.slice(11, 13)));
    const day = ymdIn.format(from);
    const currentHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );

    /* Сегодняшняя шкала существует и до второй записи. Ось начинается с
       08:00 (или раньше, если мойка уже работала) и заканчивается
       текущим часом. Будущие часы не рисуем — накопленная линия не
       обещает ещё не наступившее время, а последний столбик подписан
       словом «сейчас», чтобы обрыв шкалы не читался как потеря данных. */
    const start = Math.min(8, currentHour, ...(hours.length > 0 ? hours : [currentHour]));
    const end = Math.max(currentHour, start + 1, ...(hours.length > 0 ? hours : [currentHour]));

    const points: FlowPoint[] = [];
    for (let h = start; h <= end; h++) {
      const hh = String(h).padStart(2, '0');
      points.push({ ...at(`${day} ${hh}`, `${hh}:00`), now: h === currentHour });
    }
    return points;
  }

  /* Идём ВПЕРЁД от начала периода, а не назад от «сейчас». Пока все
     периоды заканчивались сегодняшним днём, разницы не было; с закрытым
     прошлым месяцем отсчёт от текущей минуты рисовал чужие дни.

     Ключ собирается в часовом поясе бизнеса, потому что база группирует
     именно по нему. Собранный в зоне сервера, он совпадал бы только пока
     сервер и мойка стоят в одном поясе. */
  const points: FlowPoint[] = [];
  for (let i = 0; i < days; i++) {
    const iso = ymdIn.format(new Date(from.getTime() + i * 86_400_000));
    points.push(at(`${iso} 00`, iso.slice(8, 10)));
  }
  return points;
}

function paymentLabel(p: string, t: Dict): string {
  if (p === 'cash') return t.payment.cash;
  if (p === 'card') return t.payment.card;
  if (p === 'pass') return t.payment.pass;
  return t.payment.transfer;
}
