import { redirect } from 'next/navigation';
import { requireOwner } from '@/lib/auth';
import {
  getFeed,
  getPaymentSplit,
  getPeriodStats,
  getRevenueSeries,
  getTenant,
  listServices,
  listStaff,
  startOfDay,
} from '@/lib/queries';
import { listOpenJobs } from '@/lib/jobs';
import { JobBoard } from '@/components/job-board';
import { windowFor } from '@/lib/summary-window';
import { hhmm } from '@/lib/time';
import { formatMoney, staffShare } from '@/lib/money';
import { fromOneUnit, hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { Panel, Row } from '@/components/board';
import { FlowStrip } from '@/components/flow-strip';
import {
  IconCar,
  IconIncome,
  IconOutcome,
  IconPeople,
  IconWallet,
} from '@/components/flow-icons';
import { PageHead } from '@/components/page-head';
import { DayChart, PaymentSplit, type ChartPoint } from '@/components/day-chart';
import { OrderMenu } from '@/components/order-menu';
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
  /* Очередь, люди и прайс — «сейчас», без оглядки на выбранный период:
     машина, которую приняли час назад, стоит во дворе независимо от
     того, смотрит владелец сегодняшний день или прошлый месяц. */
  const [present, openJobs, staffList, serviceList] = await Promise.all([
    whoIsOnShift(tenant.id, startOfDay(tenant.timezone)),
    listOpenJobs(tenant.id),
    listStaff(tenant.id),
    listServices(tenant.id),
  ]);
  const presentIds = new Set(present.map((p) => p.userId));

  /* Очередь и работа — разные вещи, и делятся они здесь.

     «Հերթ» это те, кто ждёт: передали и взял. Как только мойщик начал,
     машина перестаёт ждать и уходит в ленту — там она и стоит, пока не
     появится запись с деньгами. Иначе очередь показывает длину, которой
     нет: две машины в ней, а ждёт одна. */
  const queue = openJobs.filter((j) => j.status !== 'started');
  const washing = openJobs.filter((j) => j.status === 'started');

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

  /* Итог ленты считаем по тем же записям, что показаны в ней, а не
     отдельным запросом: сумма под столбцом обязана сходиться со
     столбцом, который человек видит. Отдельный запрос считал бы период
     целиком и разошёлся бы с лентой, как только та начнёт обрезаться. */
  const feedTotals = feed.reduce(
    (acc, o) => ({
      price: acc.price + o.price,
      share: acc.share + (o.staffPercent > 0 ? staffShare(o.price, o.staffPercent) : 0),
    }),
    { price: 0, share: 0 },
  );

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
          ...(period.key === 'today'
            ? []
            : [{ label: tenant.unitOne, value: String(stats.count), icon: IconCar, tone: 'teal' as const }]),
          { label: hy.owner.revenue, value: money(stats.revenue), icon: IconIncome, tone: 'violet' },
          {
            label: hy.owner.payroll,
            value: money(stats.payroll),
            sign: '−',
            icon: IconPeople,
            tone: 'teal',
          },
          {
            label: hy.owner.costs,
            value: money(costs.oneOff + costs.monthlyShare),
            sign: '−',
            icon: IconOutcome,
            tone: 'amber',
          },
          {
            label: hy.owner.profit,
            value: money(profit),
            sign: '=',
            strong: true,
            icon: IconWallet,
            tone: 'lime',
            note:
              stats.count > 0
                ? `${kept}% ${hy.owner.kept} · ${money(perUnit)} ${fromOneUnit(tenant.unitOne)}`
                : undefined,
          },
        ]}
      />

      {period.key === 'today' && (
        <section
          className="mt-[var(--seam)] grid grid-cols-3 rounded-[var(--radius-card)] bg-[color-mix(in_srgb,var(--board-ink)_5%,transparent)] px-2 py-3 sm:px-4"
          aria-label="Այսօրվա արագ ամփոփում"
        >
          {[
            { label: 'Սպասարկվել է', value: String(stats.count) },
            { label: 'Կանխիկ', value: money(stats.cash) },
            { label: hy.owner.onShift, value: String(present.length) },
          ].map((item, index) => (
            <div
              key={item.label}
              className="min-w-0 px-2 text-center sm:px-5"
              style={index === 0 ? undefined : { borderInlineStart: '1px solid var(--hairline)' }}
            >
              <div className="num truncate text-[clamp(17px,2vw,22px)] font-bold tracking-[-0.03em]">
                {item.value}
              </div>
              <div className="mt-1 truncate text-[11.5px] font-medium" style={{ color: 'var(--board-muted)' }}>
                {item.label}
              </div>
            </div>
          ))}
        </section>
      )}

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

        {/* Команда — рядом с графиком, а не под таблицей.

            Справа от графика была дыра в четыре колонки: лента занимала
            восемь, и правый столбец уезжал во второй ряд. Пустота на
            первом экране и есть то, из-за чего сводка «не знает, куда
            смотреть первым».

            Сумма здесь — заработок человека, а не выручка, которую он
            принёс. Выручку уже назвала полоса наверху; вопрос, который
            остаётся, — кому из неё сколько, и звено «зарплата» из
            цепочки здесь раскладывается по именам. */}
        {/* Команда и разрез по оплате — одним столбцом рядом с графиком.

            Порознь они стояли в разных рядах: команда наверху рядом с
            графиком, оплата внизу рядом с лентой. Ряд задаёт высоту по
            самому высокому в нём, а график высокий — под короткой
            панелью команды оставалась дыра во весь его рост. Вдвоём они
            этот рост занимают, а лента уходит вниз во всю ширину: ей
            там и место, у неё семь колонок. */}
        <div className="grid content-start gap-[var(--seam)] lg:col-span-4">
        {/* Очередь встаёт над сменой и по той же причине, по которой
            смена стоит над оплатой: и то и другое отвечает на вопрос
            «что происходит прямо сейчас», но очередь отвечает про
            машины во дворе, а смена — про людей. Машины появляются и
            уходят десятки раз за день, люди — дважды. */}
        <JobBoard
          jobs={queue.map((j) => ({
            id: j.id,
            clientKey: j.clientKey,
            staffName: j.staffName,
            serviceName: j.serviceName,
            status: j.status as 'assigned' | 'accepted' | 'started',
            waited: hy.jobs.waited(j.waitedMinutes),
          }))}
          staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
          services={serviceList.map((s) => ({ id: s.id, name: s.name }))}
          unitOne={tenant.unitOne}
          clientIdLabel={tenant.clientIdLabel}
        />

        <Panel title={hy.owner.onShift} count={crew.length}>
            {crew.length === 0 ? (
              <Empty />
            ) : (
              <div className="board-journal">
                {crew.map((s) => (
                  <Row key={s.staffId ?? 'none'}>
                    <span
                      className={`size-2 shrink-0 rounded-full ${s.present ? 'dot-live' : 'dot-idle'}`}
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
                      {money(s.earned)}
                    </span>
                  </Row>
                ))}
              </div>
            )}
          </Panel>

          {split.some((x) => x.revenue > 0) && (
            <Panel title={hy.owner.colPayment}>
              <PaymentSplit
                currency={tenant.currency}
                segments={split
                  .filter((x) => passesEnabled() || x.payment !== 'pass')
                  .map((x) => ({
                    label: paymentLabel(x.payment),
                    value: x.revenue,
                    color: PAYMENT_COLORS[x.payment] ?? 'var(--board-muted)',
                  }))}
              />
            </Panel>
          )}
        </div>

        {/* Лента машин таблицей: на широком экране строка помещается
            целиком, и тогда столбец — единственный способ сравнить
            соседние записи, не читая каждую. На телефоне та же лента
            остаётся списком в две строки. */}
        <Panel
          title={hy.owner.feed}
          count={feed.length + washing.length}
          className="lg:col-span-12 lg:self-start"
        >
          {feed.length === 0 && washing.length === 0 ? (
            <Empty />
          ) : (
            <>
              {/* Машины в работе — здесь, а не в очереди.

                  «Հերթ» это очередь ждущих; машина, которую уже моют, не
                  ждёт, и держать её там значит показывать владельцу
                  очередь длиннее настоящей. Одно и то же событие обязано
                  выглядеть одинаково на обоих экранах: у мойщика начатая
                  машина уходит из верхнего блока в журнал, здесь — из
                  очереди в ленту.

                  Денег в строке нет и в итог столбца она не входит: их
                  ещё не взяли. Сумма появится, когда машину запишут. */}
              {washing.length > 0 && (
                <div className="board-journal mb-1">
                  {washing.map((w) => (
                    <Row key={w.id}>
                      <span className="min-w-0 flex-1">
                        <span
                          className="num block truncate text-[15px] font-semibold"
                          style={{ color: 'var(--on-board)' }}
                        >
                          {w.clientKey}
                        </span>
                        <span
                          className="block truncate text-[12px]"
                          style={{ color: 'var(--board-muted)' }}
                        >
                          <span
                            className="font-semibold"
                            style={{ color: personColor(w.staffName) }}
                          >
                            {w.staffName ?? '—'}
                          </span>{' '}
                          {w.serviceName ? `· ${w.serviceName} ` : ''}
                        </span>
                      </span>
                      <span className="shrink-0 text-right">
                        <span
                          className="block text-[13px] font-semibold"
                          style={{ color: 'var(--good-on-board)' }}
                        >
                          {hy.jobs.washing}
                        </span>
                        <span
                          className="num block text-[12px]"
                          style={{ color: 'var(--board-muted)' }}
                        >
                          {hy.jobs.waited(w.waitedMinutes)}
                        </span>
                      </span>
                    </Row>
                  ))}
                </div>
              )}

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
                        <span className="font-semibold" style={{ color: personColor(o.staffName) }}>
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
                    <OrderMenu orderId={o.id} clientKey={o.clientKey} />
                  </Row>
                ))}

                {/* Тот же итог, что под таблицей: телефон и широкий
                    экран показывают одну ленту и обязаны отвечать
                    одинаково. Строка на фоне, чтобы не путалась с
                    записями над ней. */}
                <div
                  className="mt-1 flex items-center justify-between rounded-[var(--radius-chip)] px-2.5 py-2"
                  style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
                >
                  <span className="text-[13px] font-semibold">{hy.owner.feedTotal}</span>
                  <span className="num text-[14px] font-semibold">
                    {money(feedTotals.price)}
                    {feedTotals.share > 0 && (
                      <span className="font-medium" style={{ color: 'var(--board-muted)' }}>
                        {' · '}
                        {money(feedTotals.share)}
                      </span>
                    )}
                  </span>
                </div>
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
                        {/* Точка перед именем — тот же цвет человека, что
                            в списке смены и на плитке зарплаты. В таблице
                            из сорока строк по ней видно, кто мыл, до
                            чтения имени: цвет читается раньше слова. */}
                        <td>
                          <span className="flex items-center gap-2">
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ background: personColor(o.staffName) }}
                              aria-hidden
                            />
                            <span className="truncate font-medium">{o.staffName ?? '—'}</span>
                          </span>
                        </td>
                        <td style={{ color: 'var(--board-muted)' }}>{o.serviceName}</td>
                        {/* Способ оплаты меткой, а не словом в ряду с
                            остальными: наличные и карта — это не описание
                            услуги, а признак записи, и раздельно они
                            пересчитываются глазами быстрее. */}
                        <td>
                          <span className="tag">{paymentLabel(o.payment)}</span>
                        </td>
                        <td className="num end font-semibold">{money(o.price)}</td>
                        <td className="num end" style={{ color: 'var(--board-muted)' }}>
                          {o.staffPercent > 0 ? money(staffShare(o.price, o.staffPercent)) : '—'}
                        </td>
                        <td className="num end" style={{ color: 'var(--board-muted)' }}>
                          {hhmm(o.createdAt, tenant.timezone)}
                        </td>
                        <td className="end">
                          <OrderMenu orderId={o.id} clientKey={o.clientKey} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Итог под столбцами.

                      Лента отвечает «что было», но не «сколько всего», и
                      владелец складывал столбец глазами или уходил на
                      другой экран сверять. Две суммы — сколько взяли и
                      сколько из этого уходит мойщикам — стоят ровно под
                      своими столбцами, поэтому читаются без подписи. */}
                  <tfoot>
                    <tr>
                      <td colSpan={4}>{hy.owner.feedTotal}</td>
                      <td className="num end">{money(feedTotals.price)}</td>
                      <td className="num end">{money(feedTotals.share)}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </Panel>

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
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(from);
    const currentHour = Number(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        hourCycle: 'h23',
      }).format(new Date()),
    );

    /* Сегодняшняя шкала существует и до второй записи. Раньше диапазон
       строился от первого до последнего часа с продажей: одна продажа
       давала одну точку, а компонент справедливо отказывался называть её
       графиком. Теперь ось начинается с 08:00 (или раньше, если мойка уже
       работала) и заканчивается текущим часом. Будущие часы не рисуем —
       накопленная линия не обещает ещё не наступившее время. */
    const start = Math.min(8, currentHour, ...(hours.length > 0 ? hours : [currentHour]));
    const end = Math.max(currentHour, start + 1, ...(hours.length > 0 ? hours : [currentHour]));
    const points: ChartPoint[] = [];
    for (let h = start; h <= end; h++) {
      const key = `${day} ${String(h).padStart(2, '0')}`;
      points.push({ label: `${String(h).padStart(2, '0')}:00`, value: found.get(key) ?? 0 });
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
