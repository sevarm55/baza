import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  getTenant,
  startOfDay,
} from '@/lib/queries';
import { windowFor } from '@/lib/summary-window';
import { hhmm } from '@/lib/time';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { Profit } from '@/components/profit';
import { Panel, Row } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import { PageHead } from '@/components/page-head';
import { DayChart, PaymentSplit, type ChartPoint } from '@/components/day-chart';
import { CancelOrderButton } from '@/components/cancel-order-button';
import { personColor } from '@/lib/person-color';
import { getPeriod } from './periods';
import { PeriodTabs } from './period-tabs';

/* Через переменные, а не хексами: в светлой теме те же оттенки темнеют,
   иначе полоса на белом фоне выцветает до неразличимости.

   Перевод берёт не сам лайм, а --accent2-ink: чистый лайм по белой
   плитке даёт 1.06, и точка в легенде исчезла бы. В светлой теме это
   приглушённая олива, в тёмной — тот же лайм. */
const PAYMENT_COLORS: Record<string, string> = {
  cash: 'var(--good)',
  card: 'var(--accent-strong)',
  transfer: 'var(--accent2-ink)',
  pass: 'var(--warn)',
};

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string }>;
}) {
  const session = await requireOwner();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const { p } = await searchParams;
  const period = getPeriod(p);

  /* Границы и база сравнения считаются там же, где для приложения: у сайта
     и телефона должны быть одни и те же деньги за один и тот же день. */
  const w = windowFor(period.key, tenant.timezone);
  const { byHour, from, to, prevFrom, prevTo } = w;

  const [stats, feed, series, split, costs, prevStats, prevCosts] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    // лента ограничена сверху: у «прошлого месяца» она не должна
    // прихватывать записи из текущего
    getFeed(tenant.id, from, 100, to),
    getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day', to),
    getPaymentSplit(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, to, w.spread),
    getPeriodStats(tenant.id, prevFrom, prevTo),
    getPeriodCosts(tenant.id, prevFrom, prevTo, w.spread),
  ]);

  /* Кто на смене — всегда «сейчас», независимо от выбранного периода:
     вопрос «кто на мойке» к семи дням отношения не имеет.

     Список объединяем, а не показываем два: человек, который встал час
     назад и ещё ничего не намыл, в byStaff не попадает вовсе — по записям
     его не видно, а на площадке он стоит. */
  const present = await whoIsOnShift(tenant.id, startOfDay(tenant.timezone));
  const presentIds = new Set(present.map((p) => p.userId));

  const crew = [
    ...present.map((p) => {
      const worked = stats.byStaff.find((s) => s.staffId === p.userId);
      return {
        staffId: p.userId,
        name: p.name,
        present: true,
        count: worked?.count ?? 0,
        revenue: worked?.revenue ?? 0,
        earned: worked?.earned ?? 0,
      };
    }),
    ...stats.byStaff
      .filter((s) => !s.staffId || !presentIds.has(s.staffId))
      .map((s) => ({
        staffId: s.staffId,
        name: s.name,
        present: false,
        count: s.count,
        revenue: s.revenue,
        earned: s.earned,
      })),
  ];

  const money = (n: number) => formatMoney(n, tenant.currency);
  const profit = profitOf(stats.revenue, stats.payroll, costs);
  const prevProfit = profitOf(prevStats.revenue, prevStats.payroll, prevCosts);
  const points = buildPoints(series, byHour, from, w.days, tenant.timezone);

  const kept = stats.revenue > 0 ? Math.round((profit / stats.revenue) * 100) : 0;
  const perUnit = stats.count > 0 ? Math.round(profit / stats.count) : 0;
  const diff = profit - prevProfit;

  /* Разметка широкого экрана.

     Слева то, ради чего кабинет открывают: показание и рельеф периода.
     Справа — приборы, которые объясняют это число. Ниже тем же швом:
     лента машин во всю левую ширину и сводка справа.

     На телефоне двенадцать колонок схлопываются в одну, и порядок
     остаётся прежний — сначала цифра, потом приборы, потом списки. */
  return (
    <>
      {/* Дата обязательна — сутки считаются по времени бизнеса и в
          полночь начинаются заново; без неё владелец, открывший кабинет
          в половине первого, видит ноль и решает, что данные пропали. */}
      <PageHead
        title={hy.owner.tabToday}
        meta={periodDates(from, to, tenant.timezone, byHour)}
      >
        <PeriodTabs current={period.key} />
      </PageHead>

      {/* Полоса-цепочка: пять чисел одним рядом, и между ними видно,
          что из чего вычитается. Раньше здесь стояло показание выручки
          во всю треть экрана и рядом пять разноцветных плиток — глаз
          читал шесть отдельных утверждений и складывал их сам. */}
      <FlowStrip
        links={[
          { label: tenant.unitOne, value: String(stats.count) },
          { label: hy.owner.revenue, value: money(stats.revenue) },
          { label: hy.owner.payroll, value: money(stats.payroll), sign: '−' },
          {
            label: hy.owner.costs,
            value: money(costs.oneOff + costs.monthlyShare),
            sign: '−',
          },
          {
            label: hy.owner.profit,
            value: money(profit),
            sign: '=',
            strong: true,
            note:
              stats.count > 0
                ? `${kept}% ${hy.owner.kept} · ${money(perUnit)} ${hy.owner.perUnit}`
                : undefined,
          },
        ]}
      />

      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        {/* График во всю ширину рабочей части: он единственное на экране,
            что показывает не итог, а ход дня, и мелким он бесполезен.
            Сравнение с прошлым отрезком ушло к нему в заголовок — это
            подпись к линии, а не самостоятельное показание. */}
        <Panel
          title={hy.owner.revenue}
          className="lg:col-span-8 lg:self-start"
          actions={
            <span
              className="num text-[12.5px] font-semibold"
              style={{
                color:
                  prevStats.count === 0
                    ? 'var(--board-muted)'
                    : diff >= 0
                      ? 'var(--good-on-board)'
                      : 'var(--warn-on-board)',
              }}
            >
              {prevStats.count === 0
                ? hy.owner.noBase
                : `${diff >= 0 ? '+' : '−'}${money(Math.abs(diff))} ${
                    period.key === 'today' ? hy.owner.vsLastWeek : hy.owner.vsPrev
                  }`}
            </span>
          }
        >
          <DayChart points={points} currency={tenant.currency} />
        </Panel>

        {/* Лента машин таблицей: на широком экране строка помещается
            целиком, и тогда столбец — единственный способ сравнить
            соседние записи, не читая каждую. На телефоне та же лента
            остаётся списком в две строки. */}
        <Panel title={hy.owner.feed} count={feed.length} className="lg:col-span-8 lg:self-start">
          {feed.length === 0 ? (
            <Empty />
          ) : (
            <>
              <div className="board-journal lg:hidden">
                {feed.map((o) => (
                  <Row key={o.id}>
                    <span className="min-w-0 flex-1">
                      <span
                        className="num block truncate text-[15px] font-semibold"
                        style={{ color: 'var(--on-board)' }}
                      >
                        {o.clientKey ?? '—'}
                      </span>
                      <span
                        className="block truncate text-[12px]"
                        style={{ color: 'var(--board-muted)' }}
                      >
                        {/* имя цветом человека: «кто помыл» читается по
                            цвету, до чтения строки */}
                        <span
                          className="font-semibold"
                          style={{ color: personColor(o.staffName) }}
                        >
                          {o.staffName ?? '—'}
                        </span>{' '}
                        · {o.serviceName} · {paymentLabel(o.payment)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span
                        className="num block text-[15px] font-semibold"
                        style={{ color: 'var(--on-board)' }}
                      >
                        {money(o.price)}
                      </span>
                      <span
                        className="num block text-[12px]"
                        style={{ color: 'var(--board-muted)' }}
                      >
                        {o.staffPercent > 0 && <>{money(staffShare(o.price, o.staffPercent))} · </>}
                        {hhmm(o.createdAt, tenant.timezone)}
                      </span>
                    </span>
                    <CancelOrderButton orderId={o.id} />
                  </Row>
                ))}
              </div>

              <div className="hidden lg:block">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>{tenant.clientIdLabel}</th>
                      <th>{tenant.staffRole}</th>
                      <th>{hy.owner.colService}</th>
                      <th>{hy.owner.colPayment}</th>
                      <th className="end">{hy.owner.colPrice}</th>
                      <th className="end">{hy.owner.colShare}</th>
                      <th className="end">{hy.owner.colTime}</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {feed.map((o) => (
                      <tr key={o.id}>
                        <td className="num font-semibold">{o.clientKey ?? '—'}</td>
                        <td>
                          <span
                            className="font-semibold"
                            style={{ color: personColor(o.staffName) }}
                          >
                            {o.staffName ?? '—'}
                          </span>
                        </td>
                        <td style={{ color: 'var(--board-muted)' }}>{o.serviceName}</td>
                        <td style={{ color: 'var(--board-muted)' }}>{paymentLabel(o.payment)}</td>
                        <td className="num end font-semibold">{money(o.price)}</td>
                        <td className="num end" style={{ color: 'var(--board-muted)' }}>
                          {o.staffPercent > 0 ? money(staffShare(o.price, o.staffPercent)) : '—'}
                        </td>
                        <td className="num end" style={{ color: 'var(--board-muted)' }}>
                          {hhmm(o.createdAt, tenant.timezone)}
                        </td>
                        <td className="end">
                          <CancelOrderButton orderId={o.id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Panel>

        {/* Правая колонка объясняет цифру: кто её намыл, из чего она
            сложилась и чем платили. */}
        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
          <Panel title={hy.owner.onShift} count={crew.length}>
            {crew.length === 0 ? (
              <Empty />
            ) : (
              <div className="board-journal">
                {crew.map((s) => (
                  <Row key={s.staffId ?? 'none'}>
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{
                        background: s.present ? personColor(s.name) : 'transparent',
                        boxShadow: s.present
                          ? 'none'
                          : `inset 0 0 0 1.5px ${personColor(s.name)}`,
                      }}
                      aria-label={s.present ? hy.owner.onShiftNow : undefined}
                    />
                    <span
                      className="min-w-0 flex-1 truncate text-[15px] font-semibold"
                      style={{ color: 'var(--on-board)' }}
                    >
                      {s.name ?? '—'}
                    </span>
                    <span
                      className="num shrink-0 text-[13.5px]"
                      style={{ color: 'var(--board-muted)' }}
                    >
                      {s.count} {tenant.unitOne}
                    </span>
                    <span
                      className="num shrink-0 text-right text-[15px] font-semibold"
                      style={{ color: 'var(--on-board)' }}
                    >
                      {money(s.revenue)}
                    </span>
                  </Row>
                ))}
              </div>
            )}
          </Panel>

          {/* Разбор прибыли лестницей — строка на каждый вычет. Так
              устроен отчёт у всех бухгалтерских продуктов, и так
              владелец видит, где деньги ушли, а не только сколько
              осталось. */}
          <Panel title={hy.owner.profitBreakdown}>
            <Profit
              revenue={stats.revenue}
              payroll={stats.payroll}
              oneOff={costs.oneOff}
              monthlyShare={costs.monthlyShare}
              profit={profit}
              daily={period.key === 'today'}
              money={money}
            />
          </Panel>

          {split.some((s) => s.revenue > 0) && (
            <Panel title={hy.owner.colPayment}>
              <PaymentSplit
                currency={tenant.currency}
                segments={split
                  .filter((s) => passesEnabled() || s.payment !== 'pass')
                  .map((s) => ({
                    label: paymentLabel(s.payment),
                    value: s.revenue,
                    color: PAYMENT_COLORS[s.payment] ?? 'var(--board-muted)',
                  }))}
              />
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}

function Empty() {
  return (
    <p className="py-6 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
      {hy.common.empty}
    </p>
  );
}

/**
 * «1 օգոստոսի» или «1 — 7 օգոստոսի».
 *
 * Верхняя граница берётся из окна, а не из «сегодня»: у прошлого месяца
 * период закончился, и подписывать его сегодняшним числом — врать.
 */
function periodDates(from: Date, to: Date, timezone: string, single: boolean): string {
  const f = new Intl.DateTimeFormat('hy-AM', { day: 'numeric', month: 'long', timeZone: timezone });
  if (single) return f.format(from);

  // верхняя граница — начало следующих суток, поэтому день назад
  const last = new Date(Math.min(to.getTime(), Date.now()) - 1);
  const day = new Intl.DateTimeFormat('hy-AM', { day: 'numeric', timeZone: timezone });
  const sameMonth =
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(from) ===
    new Intl.DateTimeFormat('en', { month: 'numeric', timeZone: timezone }).format(last);

  // «1 — 7 օգոստոսի» вместо «1 օգոստոսի — 7 օգոստոսի»: месяц один, и
  // повторять его дважды значит забрать место у цифр
  return sameMonth ? `${day.format(from)} — ${f.format(last)}` : `${f.format(from)} — ${f.format(last)}`;
}


/**
 * Достраиваем пустые часы и дни.
 *
 * Без этого график врёт: три записи подряд в 9, 14 и 19 нарисуются
 * тремя соседними столбиками, и провала между ними не будет видно —
 * а он и есть самое интересное.
 */
function buildPoints(
  series: { key: string; revenue: number }[],
  byHour: boolean,
  from: Date,
  days: number,
  timezone: string,
): ChartPoint[] {
  const found = new Map(series.map((s) => [s.key, s.revenue]));

  if (byHour) {
    const hours = series.map((s) => Number(s.key.slice(11, 13)));
    if (hours.length === 0) return [];
    const day = series[0].key.slice(0, 10);
    const start = Math.min(...hours);
    const end = Math.max(...hours);
    const points: ChartPoint[] = [];
    for (let h = start; h <= end; h++) {
      const key = `${day} ${String(h).padStart(2, '0')}`;
      points.push({ label: String(h).padStart(2, '0'), value: found.get(key) ?? 0 });
    }
    return points;
  }

  /* Идём ВПЕРЁД от начала периода, а не назад от «сейчас». Пока все
     периоды заканчивались сегодняшним днём, разницы не было; с закрытым
     прошлым месяцем отсчёт от текущей минуты рисовал чужие дни.

     Ключ собирается в часовом поясе бизнеса, потому что база группирует
     именно по нему. Собранный в зоне сервера, он совпадал бы только пока
     сервер и мойка стоят в одном поясе. */
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const points: ChartPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const iso = ymd.format(d);
    points.push({ label: iso.slice(8, 10), value: found.get(`${iso} 00`) ?? 0 });
  }
  return points;
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
