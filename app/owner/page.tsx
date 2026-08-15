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
import { windowFor } from '@/lib/summary-window';
import { hhmm, ymd } from '@/lib/time';
import { formatMoney, staffShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import { passesEnabled } from '@/lib/features';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { whoIsOnShift } from '@/lib/shifts';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { personColor } from '@/lib/person-color';
import { getPeriod } from './periods';
import { PeriodTabs } from './period-tabs';
import { TodaySummary } from './today/summary';
import { NowPanel } from './today/now';
import { TodayCrew } from './today/crew';
import { PaymentMix } from './today/payments';
import { TodayOperations } from './today/operations';
import { FlowChart } from './today/chart';
import type { CrewMember, FlowEvent, FlowPoint, MixSlice, Op, OpenCar } from './today/model';

/**
 * Сводка дня — главный экран владельца.
 *
 * Страница отвечает на один вопрос: что происходит в бизнесе сегодня. И
 * отвечает в том порядке, в каком его задают:
 *
 *   1. сколько мне остаётся        → плита наверху;
 *   2. из чего это сложилось       → три слагаемых рядом с ней;
 *   3. что происходит сейчас       → смена и двор;
 *   4. как шёл день                → график;
 *   5. кто работает                → список людей;
 *   6. чем платили                 → разрез прихода;
 *   7. что именно было             → сегодняшняя работа.
 *
 * Раньше это был набор приборов: пять равных чисел полосой, график с
 * тем же числом в заголовке, список смены, разрез оплат и лента. Числа
 * повторялись — выручка стояла и в полосе, и над графиком, наличные и в
 * полосе, и в разрезе, — а иерархии между ними не было никакой, и глаз
 * начинал читать с того, что крупнее, а не с того, что важнее.
 *
 * Ни одно число теперь не показано дважды. Плита называет итог, полоса
 * под ней — слагаемые, график отвечает «когда», а не «сколько», лента —
 * «что именно», а не «сколько всего».
 *
 * Считает по-прежнему не эта страница. Выручка, зарплата и расходы
 * приходят из `getPeriodStats` и `getPeriodCosts`, прибыль — из
 * `profitOf`; тот же код отвечает приложению в `/api/v1/summary`, и
 * разъехаться им нельзя.
 */

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

/** Предел ленты. Тот же, что был: сводка не архив, а сегодняшний день. */
const FEED_LIMIT = 100;

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
  const isToday = period.key === 'today';

  /* Границы и база сравнения считаются там же, где для приложения: у сайта
     и телефона должны быть одни и те же деньги за один и тот же день. */
  const w = windowFor(period.key, tenant.timezone);
  const { byHour, from, to, prevFrom, prevTo } = w;

  const [stats, feed, series, split, costs, prevStats, prevCosts] = await Promise.all([
    getPeriodStats(tenant.id, from, to),
    // лента ограничена сверху: у «прошлого месяца» она не должна
    // прихватывать записи из текущего
    getFeed(tenant.id, from, FEED_LIMIT, to),
    /* Единственный запрос, которому позволено не доехать.

       График — прибор объяснительный: без него страница отвечает на все
       свои вопросы, кроме «когда был заезд». Ронять из-за него сводку с
       деньгами значит менять частичный ответ на полное молчание,
       поэтому отказ ловится здесь и превращается в состояние одной
       панели. Остальные запросы такого права не имеют: без выручки или
       без расходов страница показала бы неправду. */
    getRevenueSeries(tenant.id, from, tenant.timezone, byHour ? 'hour' : 'day', to).catch(
      () => null,
    ),
    getPaymentSplit(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, to, w.spread),
    getPeriodStats(tenant.id, prevFrom, prevTo),
    getPeriodCosts(tenant.id, prevFrom, prevTo, w.spread),
  ]);

  /* Очередь, люди и прайс — «сейчас», без оглядки на выбранный период:
     машина, которую приняли час назад, стоит во дворе независимо от
     того, смотрит владелец сегодняшний день или прошлый месяц. */
  const [present, openJobs, staffList, serviceList] = await Promise.all([
    whoIsOnShift(tenant.id, startOfDay(tenant.timezone)),
    listOpenJobs(tenant.id),
    listStaff(tenant.id),
    listServices(tenant.id),
  ]);
  const presentIds = new Set(present.map((x) => x.userId));

  const money = (n: number) => formatMoney(n, tenant.currency);
  const profit = profitOf(stats.revenue, stats.payroll, costs);
  const prevProfit = profitOf(prevStats.revenue, prevStats.payroll, prevCosts);
  const diff = profit - prevProfit;

  /* Список людей объединённый, а не два подряд: человек, который встал
     час назад и ещё ничего не намыл, в `byStaff` не попадает вовсе — по
     записям его не видно, а на площадке он стоит.

     Порядок задан состоянием: сначала те, кто на смене, потом
     отработавшие. Внутри — по заработку. */
  const crew: CrewMember[] = [
    ...present.map((x) => {
      const worked = stats.byStaff.find((s) => s.staffId === x.userId);
      return {
        staffId: x.userId,
        name: x.name,
        color: personColor(x.name),
        present: true,
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
        count: s.count,
        earned: s.earned,
      })),
  ].sort((a, b) => Number(b.present) - Number(a.present) || b.earned - a.earned);

  /* Двор целиком: и ждущие, и те, кого уже моют. Раньше они жили в
     разных местах экрана — очередь панелью, начатые первыми строками
     ленты, — и ответить «сколько машин стоит у меня прямо сейчас» можно
     было только сложив два списка. */
  const cars: OpenCar[] = openJobs.map((j) => ({
    id: j.id,
    clientKey: j.clientKey,
    staffName: j.staffName,
    staffColor: personColor(j.staffName),
    serviceName: j.serviceName,
    state:
      j.status === 'started'
        ? hy.jobs.washing
        : j.status === 'accepted'
          ? hy.jobs.accepted
          : hy.jobs.waiting,
    waited: hy.jobs.waited(j.waitedMinutes),
    washing: j.status === 'started',
  }));

  /* Записи приезжают в браузер уже посчитанными: доля исполнителя —
     `staffShare` из снимка процента в самой записи, остаток бизнеса —
     то, что после неё осталось. Второй раз это не считается нигде. */
  const ops: Op[] = feed.map((o) => {
    const share = o.staffPercent > 0 ? staffShare(o.price, o.staffPercent) : 0;
    return {
      id: o.id,
      time: hhmm(o.createdAt, tenant.timezone),
      clientKey: o.clientKey,
      staffName: o.staffName,
      staffColor: personColor(o.staffName),
      serviceName: o.serviceName,
      payment: o.payment,
      paymentLabel: paymentLabel(o.payment),
      price: o.price,
      percent: o.staffPercent,
      share,
      yours: o.price - share,
    };
  });

  /* Способы оплаты — только те, что реально встретились: строка «Փոխանցում
     0 ֏ · 0 %» сообщает ровно то же, что её отсутствие, и занимает место. */
  const mixTotal = split
    .filter((x) => (passesEnabled() || x.payment !== 'pass') && x.revenue > 0)
    .reduce((sum, x) => sum + x.revenue, 0);
  const mix: MixSlice[] = split
    .filter((x) => (passesEnabled() || x.payment !== 'pass') && x.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .map((x) => ({
      key: x.payment,
      label: paymentLabel(x.payment),
      value: x.revenue,
      share: mixTotal > 0 ? Math.round((x.revenue / mixTotal) * 100) : 0,
      color: PAYMENT_COLORS[x.payment] ?? 'var(--board-muted)',
    }));

  /* Кнопки фильтра — по тем же способам и в том же порядке, в каком они
     стоят в разрезе: два одинаковых набора, отсортированных по-разному,
     читаются как разные наборы. */
  const methods = mix
    .filter((m) => ops.some((o) => o.payment === m.key))
    .map((m) => ({ key: m.key, label: m.label }));

  const flow =
    series &&
    buildFlow(series, feed, byHour, from, w.days, tenant.timezone, {
      /* Ленту обрезает предел; час, до которого она не достала, всё ещё
         обязан показать своё число — оно приходит из базы. Имена в такой
         час просто не подписываются, вместо того чтобы подписаться
         неполно и соврать про то, кто работал. */
      namesComplete: feed.length < FEED_LIMIT,
    });

  /* Точки под графиком. У сегодняшнего дня это настоящие записи по
     минутам, у периода — дни, в которые была работа: за неделю записей
     сотни, и точки слились бы в сплошную полосу. */
  const events = flow ? buildEvents(flow, ops, byHour, tenant.unitOne) : [];

  const dayLabel = periodDates(from, to, tenant.timezone, byHour);

  return (
    <>
      {/* Дата обязательна — сутки считаются по времени бизнеса и в
          полночь начинаются заново; без неё владелец, открывший кабинет
          в половине первого, видит ноль и решает, что данные пропали. */}
      <PageHead title={hy.owner.tabToday} meta={dayLabel}>
        <PeriodTabs current={period.key} />
      </PageHead>

      <TodaySummary
        currency={tenant.currency}
        unitOne={tenant.unitOne}
        revenue={stats.revenue}
        payroll={stats.payroll}
        costs={costs.oneOff + costs.monthlyShare}
        oneOff={costs.oneOff}
        monthlyShare={costs.monthlyShare}
        profit={profit}
        count={stats.count}
      />

      {/* Операционная строка — предложением, а не тремя карточками.

          Три цифры в рамках весили бы столько же, сколько слагаемые
          выручки строкой выше, и первый экран превратился бы в семь
          равных показаний. Здесь это подпись к ним: сколько машин, по
          какому чеку и сколько людей за этим стояло. */}
      <p className="quick">
        <b className="num">{stats.count}</b> {tenant.unitOne}
        {stats.avgCheck > 0 && (
          <>
            <i />
            {hy.owner.avgCheck} <b className="num">{money(stats.avgCheck)}</b>
          </>
        )}
        <i />
        <b className="num">{isToday ? present.length : crew.length}</b>{' '}
        {tenant.staffRole.toLocaleLowerCase('hy')}
        {isToday && ` ${hy.owner.onShift.toLocaleLowerCase('hy')}`}
      </p>

      {/* Раскладка рабочей части.

          Была колонка из трёх приборов справа от графика — и вместе они
          выходили вдвое выше него. Под графиком, во всю его ширину и в
          треть экрана высотой, оставалась дыра; дыра под главным
          прибором читается как «здесь что-то не загрузилось», и это
          первое, за что цепляется глаз на широком мониторе.

          Теперь ряды собраны по высоте, а не по смыслу колонок:

            график (8)   ·  сейчас (4)     — оба около четырёхсот точек
            кто (6)      ·  чем платят (6) — оба около двухсот
            сегодняшняя работа (12)

          Места приборов заданы явными `col-start`, поэтому порядок в
          разметке от раскладки не зависит: на телефоне колонки нет, и
          приборы идут сверху вниз в том порядке, в каком владелец
          задаёт вопросы, — «что сейчас», потом «как шёл день». */}
      <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
        <NowPanel
          className="lg:col-span-4 lg:col-start-9 lg:row-start-1 lg:self-start"
          cars={cars}
          staff={staffList.map((s) => ({ id: s.id, name: s.name }))}
          services={serviceList.map((s) => ({ id: s.id, name: s.name }))}
          unitOne={tenant.unitOne}
          staffRole={tenant.staffRole}
          clientIdLabel={tenant.clientIdLabel}
          onShift={present.length}
          since={present[0] ? hhmm(present[0].openedAt, tenant.timezone) : null}
          lastRecord={isToday && feed[0] ? hhmm(feed[0].createdAt, tenant.timezone) : null}
          recordsToday={isToday ? stats.count : 0}
        />

        {/* График занимает две трети ширины: он единственное на экране,
            что показывает не итог, а ход периода, и мелким он бесполезен.
            Сравнение с прошлым отрезком ушло к нему в заголовок — это
            подпись к линии, а не самостоятельное показание.

            Высоту он берёт по ряду: если во дворе много машин и сосед
            справа вырос, поле графика дорастает вместе с ним, а не
            оставляет под собой пустоту. */}
        <Panel
          title={byHour ? hy.today.flowDay : hy.today.flowPeriod}
          className="lg:col-span-8 lg:col-start-1 lg:row-start-1"
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
                    isToday ? hy.owner.vsLastWeek : hy.owner.vsPrev
                  }`}
            </span>
          }
        >
          {flow ? (
            <FlowChart
              points={flow}
              events={events}
              currency={tenant.currency}
              unitOne={tenant.unitOne}
              byHour={byHour}
            />
          ) : (
            /* Не доехал только график. Панель говорит, что именно не
               получилось, и предлагает повторить — остальная страница
               при этом на месте и продолжает отвечать. */
            <div className="grid justify-items-center gap-2 py-12 text-center">
              <p className="text-[14px] font-semibold">{hy.today.flowFailed}</p>
              <a className="btn-inline" href={period.key === 'today' ? '/owner' : `/owner?p=${period.key}`}>
                {hy.payroll.retry}
              </a>
            </div>
          )}
        </Panel>

        {/* Второй ряд: кто работал и чем платили. Оба списка короткие и
            примерно одного роста, поэтому стоят пополам — и ни один не
            оставляет под собой пустоты. */}
        <TodayCrew
          className="lg:col-span-6 lg:col-start-1 lg:row-start-2 lg:self-start"
          crew={crew}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
          title={isToday ? hy.today.working : hy.settings.staff}
        />

        <PaymentMix
          className="lg:col-span-6 lg:col-start-7 lg:row-start-2 lg:self-start"
          slices={mix}
          currency={tenant.currency}
        />

        <TodayOperations
          ops={ops}
          currency={tenant.currency}
          unitOne={tenant.unitOne}
          staffRole={tenant.staffRole}
          clientIdLabel={tenant.clientIdLabel}
          title={isToday ? hy.today.work : hy.owner.feed}
          note={
            feed.length >= FEED_LIMIT
              ? hy.today.lastRecords(feed.length)
              : hy.today.workAll(dayLabel)
          }
          /* «Сегодня ещё нет записей» у закрытого месяца — неправда
             дважды: месяц не сегодня, и ничего уже не «ещё». */
          empty={
            isToday
              ? { title: hy.owner.emptyToday, note: hy.today.emptyNote }
              : { title: hy.today.noRecords }
          }
          methods={methods}
        />
      </div>
    </>
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

/**
 * Точки на полосе времени под графиком.
 *
 * У сегодняшнего дня точка — одна запись, поставленная в свою минуту
 * между часами оси; поэтому у неё есть номер машины, услуга, цена и тот,
 * кто мыл, — всё то, о чём спрашивают, ткнув в неё.
 *
 * У недели и месяца записей были бы сотни, и точки слились бы в
 * сплошную полосу. Там точка — день, в который была работа, со своим
 * приходом и числом машин.
 *
 * Положение считается здесь, а не в самом графике: только страница
 * знает, от какого часа до какого идёт ось выбранного периода.
 */
function buildEvents(
  points: FlowPoint[],
  ops: Op[],
  byHour: boolean,
  unitOne: string,
): FlowEvent[] {
  if (points.length === 0) return [];

  if (!byHour) {
    const span = points.length - 1;
    return points
      .map((p, i) => ({ p, i }))
      .filter(({ p }) => p.count > 0)
      .map(({ p, i }) => ({
        id: `d-${p.label}-${i}`,
        at: span > 0 ? i / span : 0.5,
        time: p.label,
        title: `${p.count} ${unitOne}`,
        note: p.people.length > 0 ? p.people.join(', ') : null,
        price: p.value,
        who: null,
        share: 0,
      }));
  }

  const startHour = Number(points[0].label.slice(0, 2));
  const endHour = Number(points[points.length - 1].label.slice(0, 2));
  const span = endHour - startHour;

  /* Записи приходят от новых к старым; ось читают слева направо, и
     последней точкой обязана оказаться последняя по времени машина —
     именно она помечена лаймом. */
  return [...ops].reverse().map((o) => {
    const h = Number(o.time.slice(0, 2));
    const m = Number(o.time.slice(3, 5));
    const at = span > 0 ? (h + m / 60 - startHour) / span : 0.5;
    return {
      id: o.id,
      at: Math.min(1, Math.max(0, at)),
      time: o.time,
      title: o.clientKey ?? '—',
      note: o.serviceName,
      price: o.price,
      who: o.staffName,
      share: o.share,
    };
  });
}

function paymentLabel(p: string): string {
  if (p === 'cash') return hy.payment.cash;
  if (p === 'card') return hy.payment.card;
  if (p === 'pass') return hy.payment.pass;
  return hy.payment.transfer;
}
