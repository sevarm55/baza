'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  Banknote,
  CarFront,
  ChartNoAxesCombined,
  Contact,
  FileChartColumn,
  ReceiptText,
  Users,
} from 'lucide-react';
import { Figures, Panel, Plate } from '@/components/board';
import { NumericText } from '@/components/numeric-text';
import { Wordmark } from '@/components/wordmark';
import { formatMoney } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { useT } from '@/lib/i18n/client';
import { fromOneUnit, staffCount, unitCount } from '@/lib/i18n/terms';
import {
  DEMO,
  DEMO_PERIODS,
  DEMO_RATE,
  type DemoEvent,
  type DemoOrder,
  type DemoPeriod,
  type DemoPoint,
} from './landing-demo';
import s from './landing.module.css';

/**
 * Рабочая панель на витрине.
 *
 * Это не снимок кабинета и не его макет: приборы здесь настоящие — плита
 * итога, полоса слагаемых и панели приезжают из `components/board.tsx`,
 * теми же компонентами, которыми нарисована сводка дня. Числа перекатывает
 * тот же `NumericText`, что и в продукте. Расхождение витрины и кабинета
 * тут невозможно по устройству: чтобы они разошлись, надо сломать сам
 * кабинет.
 *
 * Пять состояний, и вместе они — один рабочий день:
 *
 *   0  машину записали          → счётчик и выручка сдвинулись
 *   1  день сложился            → плита, слагаемые, ход дня
 *   2  зарплата посчиталась     → люди смены и лента
 *   3  расход вписали           → «вам остаётся» пересчиталось
 *   4  период закрыли           → тот же расчёт за неделю и месяц
 *
 * На компьютере состояние выбирает прокрутка: текст слева идёт экран за
 * экраном, панель справа стоит и перестраивается. На телефоне — палец:
 * полоса вкладок сверху. Липкая панель в половину телефонного экрана
 * забрала бы половину экрана, которой нельзя пользоваться.
 *
 * ЧТО ЗДЕСЬ НАСТОЯЩЕЕ. Формы работают. Номер можно вписать свой, услугу
 * и оплату выбрать, цену поменять — машина встанет в список, счётчик
 * подрастёт, доля исполнителя начислится по той же ставке, «вам
 * остаётся» пересчитается. То же с расходом. Это и есть весь замысел:
 * не рассказывать, как работает Tetrin, а дать им немного поработать.
 */

/** Сцены и разделы, которыми они подсвечиваются в боковой колонке. */
const SCENES = ['units', 'overview', 'staff', 'expenses', 'reports'] as const;
type Scene = (typeof SCENES)[number];

/** Разделы колонки. Порядок и значки — те же, что в кабинете. */
const RAIL: { key: string; icon: typeof CarFront }[] = [
  { key: 'overview', icon: ChartNoAxesCombined },
  { key: 'units', icon: CarFront },
  { key: 'staff', icon: Users },
  { key: 'payroll', icon: Banknote },
  { key: 'expenses', icon: ReceiptText },
  { key: 'clients', icon: Contact },
  { key: 'reports', icon: FileChartColumn },
];

/** Валюта показа. Бизнес в Ереване берёт драмы — от языка это не зависит. */
const CURRENCY = 'AMD';

export function LandingWorkspace({
  /* Слова бизнеса приходят из конфига ниши — того же, что получает
     настоящий бизнес при регистрации. Склонения и переводы делает
     `lib/i18n/terms.ts`: «37 машин», «37 մեքենա», «37 cars». */
  unitOne,
  staffRole,
}: {
  unitOne: string;
  staffRole: string;
}) {
  const t = useT();
  const d = t.landing.demo;
  const money = (n: number) => formatMoney(n, CURRENCY, t.locale);

  const [step, setStep] = useState(0);
  /** Машина, которую записывают на глазах: 35 AA 777. */
  const [registered, setRegistered] = useState(false);
  /** Машины, которые вписал сам посетитель. */
  const [extra, setExtra] = useState<DemoOrder[]>([]);
  /** Вода за август — расход, который вписывают на глазах. */
  const [waterLogged, setWaterLogged] = useState(false);
  /** Расходы, которые вписал сам посетитель. */
  const [extraCosts, setExtraCosts] = useState<{ category: number; amount: number }[]>([]);
  const [period, setPeriod] = useState<DemoPeriod>('today');

  /* Широкий экран — единственное, что различает две композиции.
     Читается через `matchMedia`, а не через ширину при первом рендере:
     окно меняют мышью, и композиция обязана меняться вместе с ним. */
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* Сцена по прокрутке. Полоса срабатывания — середина экрана: сцена
     меняется тогда, когда текст оказался перед глазами, а не когда он
     только показался снизу. */
  const beats = useRef<(HTMLElement | null)[]>([]);
  useEffect(() => {
    if (!wide) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setStep(Number((e.target as HTMLElement).dataset.beat));
        }
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    for (const el of beats.current) if (el) io.observe(el);
    return () => io.disconnect();
    /* Язык в зависимостях — вторая застёжка к ключам выше. Наблюдатель
       держит ссылки на узлы, а не на компоненты, и любая пересборка
       разметки оставляет его следить за пустотой. Пересобрать его стоит
       ничего, а поймать такое в браузере — полдня. */
  }, [wide, t.locale]);

  /* Две вещи, которые происходят сами.

     Витрину листают, а не изучают, и человек, который просто скроллит,
     обязан увидеть механику продукта без единого нажатия: машина
     записывается, расход вписывается, числа сдвигаются. Формы при этом
     остаются живыми — тот, кто захочет, вписывает своё. */
  useEffect(() => {
    if (step !== 0 || registered) return;
    const id = setTimeout(() => setRegistered(true), 800);
    return () => clearTimeout(id);
  }, [step, registered]);

  useEffect(() => {
    if (step !== 3 || waterLogged) return;
    const id = setTimeout(() => setWaterLogged(true), 800);
    return () => clearTimeout(id);
  }, [step, waterLogged]);

  /* ─────────────────────── арифметика дня ───────────────────────

     Ни одно число ниже не записано готовым. Всё складывается из смены:
     люди приносят выручку, из неё по ставке начисляется доля, расходы
     вычитаются. Так его и сложит глазами тот, кто решит проверить. */

  /** Записи, которых в базовой смене ещё не было, — по порядку времени. */
  const added = useMemo<DemoOrder[]>(
    () => [...(registered ? [DEMO.fresh] : []), ...extra],
    [extra, registered],
  );

  const crew = useMemo(
    () =>
      DEMO.crew.map((person, i) => {
        const mine = added.filter((o) => o.staff === i);
        const revenue = person.revenue + mine.reduce((n, o) => n + o.price, 0);
        return {
          ...person,
          revenue,
          count: person.count + mine.length,
          /* Заработок не хранится, а считается: рядом на экране стоят и
             выручка, и ставка, и сумма — они обязаны сходиться. */
          earned: Math.round((revenue * DEMO_RATE) / 100),
        };
      }),
    [added],
  );

  const spend = useMemo(
    () => [
      ...DEMO.spend,
      ...(waterLogged ? [DEMO.freshCost] : []),
      ...extraCosts,
    ],
    [waterLogged, extraCosts],
  );

  const today = useMemo(() => {
    const count = crew.reduce((n, c) => n + c.count, 0);
    const revenue = crew.reduce((n, c) => n + c.revenue, 0);
    const payroll = crew.reduce((n, c) => n + c.earned, 0);
    const costs = spend.reduce((n, c) => n + c.amount, 0);
    return { count, revenue, payroll, costs, net: revenue - payroll - costs };
  }, [crew, spend]);

  /** Список последних машин: свежая сверху. */
  const orders = useMemo<DemoOrder[]>(() => [...added].reverse().concat(DEMO.orders), [added]);

  /** Лента смены. Записанное на глазах приходит в неё же. */
  const feed = useMemo<DemoEvent[]>(
    () => [
      ...[...added].reverse().map((o) => ({
        time: o.time,
        staff: o.staff,
        kind: 'added' as const,
        plate: o.plate,
      })),
      ...DEMO.feed,
    ],
    [added],
  );

  /** Часы дня. Записанное попадает в свой час, иначе график соврёт. */
  const hours = useMemo<DemoPoint[]>(() => {
    const list = DEMO.hours.map((p) => ({ ...p }));
    for (const o of added) {
      const hour = o.plate === DEMO.fresh.plate && o.time === DEMO.fresh.time ? '14' : null;
      const cell = list.find((p) => p.label === hour) ?? list[list.length - 1];
      cell.revenue += o.price;
      cell.count += 1;
    }
    return list;
  }, [added]);

  /** Что показывает отчёт: сегодняшний день считается, остальные закрыты. */
  const report =
    period === 'today'
      ? { totals: today, points: hours }
      : DEMO.periods[period];

  const scene = SCENES[step];

  /* ─────────────────────── действия форм ─────────────────────── */

  function addUnit(order: DemoOrder) {
    setExtra((was) => [...was, order]);
  }

  function addCost(cost: { category: number; amount: number }) {
    setExtraCosts((was) => [...was, cost]);
  }

  /** Перейти к сцене. С колонки — прокруткой, с телефона — сразу. */
  function goto(next: number) {
    setStep(next);
    if (wide) beats.current[next]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  return (
    <div className={s.stageGrid}>
      {/* Полоса сцен — телефон и планшет. На компьютере её нет: там
          сцену выбирает прокрутка. */}
      <div className={s.segments} role="group" aria-label={t.landing.nav.how}>
        {t.landing.beats.map((beat, i) => (
          <button
            key={i}
            type="button"
            aria-pressed={step === i}
            className={s.segment}
            data-on={step === i ? '' : undefined}
            onClick={() => setStep(i)}
          >
            {beat.label}
          </button>
        ))}
      </div>

      <div className={s.beats}>
        {/* Ключ — номер сцены, а НЕ её подпись, и это не придирка к стилю.

            Подпись переводится. При смене языка `router.refresh()`
            перерисовывает страницу новым словарём, ключи всех пяти сцен
            меняются разом, React выбрасывает старые узлы и создаёт новые —
            а наблюдатель прокрутки продолжает следить за выброшенными.
            Оторванный от документа узел не пересекается ни с чем никогда,
            и панель замирала на той сцене, на которой человек переключил
            язык: дальше он листал, а справа ничего не менялось. */}
        {t.landing.beats.map((beat, i) => (
          <section
            key={i}
            ref={(el) => {
              beats.current[i] = el;
            }}
            data-beat={i}
            data-on={step === i ? '' : undefined}
            className={s.beat}
          >
            <div className={s.beatLabel}>
              <b>{String(i + 1).padStart(2, '0')}</b>
              {beat.label}
            </div>
            <h2 className={s.beatTitle}>{beat.title}</h2>
            <p className={s.beatBody}>{beat.body}</p>
          </section>
        ))}
      </div>

      <div className={s.frameWrap}>
        <div className={s.frame}>
          <aside className={s.rail}>
            <div className={s.railHead}>
              <Wordmark className={s.railWord} />
              <span className={s.railDemo}>{d.demoBadge}</span>
            </div>

            <div className={s.railBiz}>
              <span className={s.railBizName}>{d.business}</span>
              <span className={s.railBizPoint}>{d.point}</span>
            </div>

            <nav className={s.railNav} aria-label={d.nav.overview}>
              {RAIL.map(({ key, icon: Icon }) => {
                const at = SCENES.indexOf(key as Scene);
                const label = d.nav[key as keyof typeof d.nav];

                /* Раздел, которого в показе нет, — не кнопка. Зона,
                   которая выглядит нажимаемой и не нажимается, — самая
                   дорогая ошибка витрины: после неё не верят и тому,
                   что нажимается. */
                if (at === -1) {
                  return (
                    <span key={key} className={`${s.railItem} ${s.railItemOff}`}>
                      <Icon aria-hidden />
                      {label}
                    </span>
                  );
                }

                return (
                  <button
                    key={key}
                    type="button"
                    className={s.railItem}
                    data-on={scene === key ? '' : undefined}
                    aria-current={scene === key ? 'true' : undefined}
                    onClick={() => goto(at)}
                  >
                    <Icon aria-hidden />
                    {label}
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* `board` из globals.css: внутри него чернила, линии, поля и
              кнопки становятся полотном кабинета — теми же, что там. */}
          <div className={`board ${s.canvas}`}>
            <header className={s.canvasHead}>
              <h3 className={s.canvasTitle}>{d.nav[scene as keyof typeof d.nav]}</h3>
              <span className={s.live}>
                <i aria-hidden />
                {d.live} · {DEMO.now}
              </span>
            </header>

            {scene === 'units' && (
              <Capture
                d={d}
                money={money}
                orders={orders}
                count={today.count}
                revenue={today.revenue}
                onAdd={addUnit}
                nextTime={extra.length}
              />
            )}

            {scene === 'overview' && (
              <Overview
                d={d}
                t={t}
                money={money}
                today={today}
                orders={orders}
                hours={hours}
                onShift={crew.filter((c) => c.onShift).length}
                unitOne={unitOne}
                staffRole={staffRole}
              />
            )}

            {scene === 'staff' && (
              <Team d={d} t={t} money={money} crew={crew} feed={feed} payroll={today.payroll} />
            )}

            {scene === 'expenses' && (
              <Costs d={d} t={t} money={money} spend={spend} today={today} onAdd={addCost} />
            )}

            {scene === 'reports' && (
              <Report
                d={d}
                t={t}
                money={money}
                period={period}
                onPeriod={setPeriod}
                totals={report.totals}
                points={report.points}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ сцена 1: запись ══════════════════════════ */

function Capture({
  d,
  money,
  orders,
  count,
  revenue,
  onAdd,
  nextTime,
}: {
  d: Demo;
  money: (n: number) => string;
  orders: DemoOrder[];
  count: number;
  revenue: number;
  onAdd: (order: DemoOrder) => void;
  /** сколько машин уже вписали: из этого получается время следующей */
  nextTime: number;
}) {
  const [plate, setPlate] = useState('');
  const [service, setService] = useState(0);
  const [payment, setPayment] = useState(0);
  const [price, setPrice] = useState('8000');
  const [done, setDone] = useState<string | null>(null);

  const amount = Number(price.replace(/\D/g, ''));
  const ready = plate.trim().length >= 4 && amount > 0;

  return (
    <div className={s.scene}>
      <form
        className={`${s.form} ${s.col6}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const key = plate.trim().toUpperCase();
          onAdd({
            /* Время следующей записи — через три минуты после предыдущей.
               От часов браузера оно не зависит: смена показана целиком, и
               запись, помеченная сегодняшним «сейчас», выпала бы из неё. */
            time: shiftTime(nextTime),
            plate: key,
            service,
            payment,
            staff: 0,
            price: amount,
          });
          setDone(key);
          setPlate('');
        }}
      >
        <div className={s.formHead}>
          {d.newUnit}
          <span>{d.taps}</span>
        </div>

        <div className={s.formRow}>
          <label className={s.formLabel} htmlFor="demo-plate">
            {d.plate}
          </label>
          <input
            id="demo-plate"
            className="field num"
            value={plate}
            onChange={(e) => setPlate(e.target.value)}
            placeholder={d.platePlaceholder}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <Picks
          label={d.service}
          id="demo-service"
          options={d.services}
          value={service}
          onPick={setService}
        />

        <Picks
          label={d.payment}
          id="demo-payment"
          options={d.payments}
          value={payment}
          onPick={setPayment}
        />

        <div className={s.formRow}>
          <label className={s.formLabel} htmlFor="demo-price">
            {d.price}
          </label>
          <input
            id="demo-price"
            className="field num"
            inputMode="numeric"
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/\D/g, '').slice(0, 7))}
            autoComplete="off"
          />
        </div>

        <button type="submit" className={s.formSubmit} disabled={!ready}>
          {d.add}
        </button>

        {done && (
          <p className={s.done} key={done} role="status">
            <b>{done}</b> {d.registered} ✓
          </p>
        )}
      </form>

      <div className={s.col6}>
        <div className={s.stats}>
          <div className={s.statCell}>
            <div className={s.statLabel}>{d.units}</div>
            <div className={s.statValue}>
              <NumericText>{String(count)}</NumericText>
            </div>
          </div>
          <div className={s.statCell}>
            <div className={s.statLabel}>{d.avgCheck}</div>
            <div className={s.statValue}>
              <NumericText>{money(Math.round(revenue / Math.max(1, count)))}</NumericText>
            </div>
          </div>
        </div>

        <Panel title={d.lastUnits} count={count} className={s.stack}>
          <div className="board-journal">
            {orders.slice(0, 5).map((o, i) => (
              <Line key={`${o.plate}-${o.time}`} d={d} order={o} money={money} fresh={i === 0} />
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

/** «14:32» → «14:35» → «14:38». Смена, а не часы того, кто смотрит. */
function shiftTime(index: number): string {
  const base = 14 * 60 + 32 + (index + 1) * 3;
  const h = Math.floor(base / 60) % 24;
  const m = base % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/* ══════════════════════════ сцена 2: день ══════════════════════════ */

function Overview({
  d,
  t,
  money,
  today,
  orders,
  hours,
  onShift,
  unitOne,
  staffRole,
}: {
  d: Demo;
  t: ReturnType<typeof useT>;
  money: (n: number) => string;
  today: Totals;
  orders: DemoOrder[];
  hours: DemoPoint[];
  onShift: number;
  unitOne: string;
  staffRole: string;
}) {
  /* Доля и «с одной машины» — ровно те же две подписи, что стоят под
     плитой в кабинете, и считаются они здесь так же. */
  const kept = today.revenue > 0 ? Math.round((today.net / today.revenue) * 100) : 0;
  const perUnit = today.count > 0 ? Math.round(today.net / today.count) : 0;

  return (
    <div className={s.scene}>
      <div className={s.col5}>
        <Plate
          label={t.owner.profit}
          value={money(today.net)}
          note={`${kept}% ${t.owner.kept} · ${money(perUnit)} ${fromOneUnit(unitOne, t.locale)}`}
        />
      </div>

      <div className={s.col7}>
        <Figures
          items={[
            { label: t.owner.revenue, value: money(today.revenue) },
            { label: t.owner.payrollAccrued, value: money(today.payroll), sign: '−' },
            { label: t.expenses.title, value: money(today.costs), sign: '−' },
          ]}
        />
      </div>

      {/* Операционная строка — предложением, а не тремя карточками. Три
          цифры в рамках весили бы столько же, сколько слагаемые выше, и
          сцена превратилась бы в семь равных показаний. */}
      <p className={`quick ${s.col12}`}>
        {unitCount(today.count, unitOne, t.locale)}
        <i />
        {d.avgCheck}{' '}
        <b className="num">{money(Math.round(today.revenue / Math.max(1, today.count)))}</b>
        <i />
        {staffCount(onShift, staffRole, t.locale)} {d.onShift}
      </p>

      <Panel title={d.flow} className={s.col7}>
        <Chart points={hours} labels={{ line: t.today.accumulated, bar: t.today.inHour }} />
      </Panel>

      <Panel title={d.lastUnits} count={today.count} className={s.col5}>
        <div className="board-journal">
          {orders.slice(0, 4).map((o, i) => (
            <Line key={`${o.plate}-${o.time}`} d={d} order={o} money={money} fresh={i === 0} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ══════════════════════════ сцена 3: команда ══════════════════════════ */

function Team({
  d,
  t,
  money,
  crew,
  feed,
  payroll,
}: {
  d: Demo;
  t: ReturnType<typeof useT>;
  money: (n: number) => string;
  crew: { count: number; revenue: number; earned: number; onShift: boolean }[];
  feed: DemoEvent[];
  payroll: number;
}) {
  return (
    <div className={s.scene}>
      <Panel
        title={d.team}
        count={crew.length}
        className={s.col7}
        actions={<span className={s.hint}>{d.autoPayroll}</span>}
      >
        <div className="board-journal">
          {crew.map((person, i) => {
            const name = d.crew[i];
            const color = personColor(name);
            return (
              <div key={i} className={s.person}>
                <span
                  className={`${s.personDot} ${person.onShift ? '' : s.personOff}`}
                  style={{ background: color, color }}
                  aria-hidden
                />
                <span>
                  <span className={s.personName}>{name}</span>
                  <span className={s.personMeta}>
                    {person.count} · {d.brought} {money(person.revenue)}
                  </span>
                </span>
                <span className={s.personMoney}>
                  <span className={s.personEarned}>
                    <NumericText>{money(person.earned)}</NumericText>
                  </span>
                  <span className={s.personRate}>
                    {DEMO_RATE}% {d.rate}
                  </span>
                </span>
              </div>
            );
          })}
        </div>

        {/* Итог столбца. Подпись здесь называет само показание, а не
            повторяет пояснение из заголовка прибора: два одинаковых
            предложения на одном приборе читаются как ошибка вёрстки. */}
        <div className={s.sum}>
          <span>{t.owner.toPay}</span>
          <b className="num">
            <NumericText>{money(payroll)}</NumericText>
          </b>
        </div>
      </Panel>

      <Panel title={d.activity} className={s.col5}>
        <div className="board-journal">
          {feed.slice(0, 6).map((e, i) => (
            <p key={`${e.time}-${i}`} className={s.event}>
              <time>{e.time}</time>
              <span>
                <b>{d.crew[e.staff]}</b>{' '}
                {e.kind === 'added' && e.plate ? d.feedAdded(e.plate) : d.feedOpened}
              </span>
            </p>
          ))}
        </div>
      </Panel>
    </div>
  );
}

/* ══════════════════════════ сцена 4: расходы ══════════════════════════ */

function Costs({
  d,
  t,
  money,
  spend,
  today,
  onAdd,
}: {
  d: Demo;
  t: ReturnType<typeof useT>;
  money: (n: number) => string;
  spend: { category: number; amount: number }[];
  today: Totals;
  onAdd: (cost: { category: number; amount: number }) => void;
}) {
  const [category, setCategory] = useState(3);
  const [amount, setAmount] = useState('18000');
  const [note, setNote] = useState('');

  const value = Number(amount.replace(/\D/g, ''));
  const total = spend.reduce((n, c) => n + c.amount, 0);

  return (
    <div className={s.scene}>
      <form
        className={`${s.form} ${s.col5}`}
        onSubmit={(e) => {
          e.preventDefault();
          if (value <= 0) return;
          onAdd({ category, amount: value });
          setAmount('');
        }}
      >
        <div className={s.formHead}>{d.newCost}</div>

        <Picks
          label={d.category}
          id="demo-category"
          options={d.categories}
          value={category}
          onPick={setCategory}
        />

        <div className={s.formRow}>
          <label className={s.formLabel} htmlFor="demo-amount">
            {d.amount}
          </label>
          <input
            id="demo-amount"
            className="field num"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
            autoComplete="off"
          />
        </div>

        <div className={s.formRow}>
          <label className={s.formLabel} htmlFor="demo-note">
            {d.comment}
          </label>
          <input
            id="demo-note"
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={d.commentPlaceholder}
            maxLength={40}
            autoComplete="off"
          />
        </div>

        <button type="submit" className={s.formSubmit} disabled={value <= 0}>
          {d.addCost}
        </button>
      </form>

      <div className={s.col7}>
        {/* Та же плита, что на сводке, и то же число. Расход вписали —
            она пересчиталась: причина и следствие стоят рядом, и связь
            между ними не приходится объяснять словами. Подпись под
            числом называет весь расчёт целиком, чтобы его можно было
            проверить, не уходя с экрана. */}
        <Plate
          label={t.owner.profit}
          value={money(today.net)}
          note={`${money(today.revenue)} − ${money(today.payroll)} − ${money(total)}`}
        />

        <Panel title={d.costsToday} count={spend.length} className={s.stack}>
          <div className="board-journal">
            {spend.map((c, i) => (
              /* Столбца времени у расхода нет: его вписывают за день, а не
                 в минуту. Пустая ячейка с прочерком тут ничего не значит,
                 а прочерк в столбце читается как «данных не хватает». */
              <div
                key={`${c.category}-${i}`}
                className={`${s.line} ${s.lineFlat} ${i >= DEMO.spend.length ? s.lineFresh : ''}`}
              >
                <span className={s.lineMain}>
                  <span className={s.lineKey}>{d.categories[c.category]}</span>
                </span>
                <span className={s.lineMoney}>− {money(c.amount)}</span>
              </div>
            ))}
          </div>

          <div className={s.sum}>
            <span>{t.common.total}</span>
            <b className="num">
              <NumericText>{money(total)}</NumericText>
            </b>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ══════════════════════════ сцена 5: отчёт ══════════════════════════ */

function Report({
  d,
  t,
  money,
  period,
  onPeriod,
  totals,
  points,
}: {
  d: Demo;
  t: ReturnType<typeof useT>;
  money: (n: number) => string;
  period: DemoPeriod;
  onPeriod: (next: DemoPeriod) => void;
  totals: Totals;
  points: DemoPoint[];
}) {
  return (
    <div className={s.scene}>
      <div className={s.col12}>
        <div className={s.periods} role="group" aria-label={d.report}>
          {DEMO_PERIODS.map((key, i) => (
            <button
              key={key}
              type="button"
              aria-pressed={period === key}
              className={s.periodItem}
              data-on={period === key ? '' : undefined}
              onClick={() => onPeriod(key)}
            >
              {d.periods[i]}
            </button>
          ))}
        </div>
      </div>

      <div className={`${s.report} ${s.col12}`}>
        <div className={s.reportCell}>
          <div className={s.reportLabel}>{d.units}</div>
          <div className={s.reportValue}>
            <NumericText>{String(totals.count)}</NumericText>
          </div>
        </div>
        <div className={s.reportCell}>
          <div className={s.reportLabel}>{t.owner.revenue}</div>
          <div className={s.reportValue}>
            <NumericText>{money(totals.revenue)}</NumericText>
          </div>
        </div>
        <div className={s.reportCell}>
          <div className={s.reportLabel}>{t.owner.payrollAccrued}</div>
          <div className={s.reportValue}>
            <NumericText>{money(totals.payroll)}</NumericText>
          </div>
        </div>
        <div className={s.reportCell}>
          <div className={s.reportLabel}>{t.expenses.title}</div>
          <div className={s.reportValue}>
            <NumericText>{money(totals.costs)}</NumericText>
          </div>
        </div>
        <div className={s.reportCell} data-net>
          <div className={s.reportLabel}>{t.owner.profit}</div>
          <div className={s.reportValue}>
            <NumericText>{money(totals.net)}</NumericText>
          </div>
        </div>
      </div>

      <Panel title={d.flow} className={s.col12}>
        <Chart
          points={points}
          labels={{
            line: t.today.accumulated,
            bar: period === 'today' ? t.today.inHour : t.today.inDay,
          }}
        />
      </Panel>
    </div>
  );
}

/* ══════════════════════════ общие детали ══════════════════════════ */

/**
 * Выбор из трёх-четырёх — кнопками, а не выпадающим списком.
 *
 * Вариантов мало, и все они помещаются на экран; список отнял бы у
 * человека нажатие и спрятал бы за ним то, что и так видно.
 */
function Picks({
  label,
  id,
  options,
  value,
  onPick,
}: {
  label: string;
  id: string;
  options: readonly string[];
  value: number;
  onPick: (next: number) => void;
}) {
  return (
    <div className={s.formRow}>
      <span className={s.formLabel} id={id}>
        {label}
      </span>
      <div className={s.picks} role="radiogroup" aria-labelledby={id}>
        {options.map((name, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            className={s.pickItem}
            data-on={value === i ? '' : undefined}
            onClick={() => onPick(i)}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Строка машины: когда, какая, кто мыл, что делали и сколько взяли. */
function Line({
  d,
  order,
  money,
  fresh,
}: {
  d: Demo;
  order: DemoOrder;
  money: (n: number) => string;
  fresh?: boolean;
}) {
  const name = d.crew[order.staff];
  return (
    <div className={`${s.line} ${fresh ? s.lineFresh : ''}`}>
      <span className={s.lineTime}>{order.time}</span>
      <span className={s.lineMain}>
        <span className={s.lineKey}>{order.plate}</span>
        <span className={s.lineNote}>
          <i style={{ background: personColor(name) }} aria-hidden />
          {name} · {d.services[order.service]} · {d.payments[order.payment]}
        </span>
      </span>
      <span className={s.lineMoney}>{money(order.price)}</span>
    </div>
  );
}

/**
 * Ход периода: столбики — сколько за отрезок, линия — сколько накопилось.
 *
 * Разбор тот же, что у графика в кабинете, и по той же причине: столбики
 * блоками тянутся по ширине без искажений, а линию рисует SVG, где
 * толщину штриха держит `vector-effect`. Всё, чего здесь нет по
 * сравнению с кабинетом, — наведение: витрину листают, а не изучают.
 */
function Chart({ points, labels }: { points: DemoPoint[]; labels: { line: string; bar: string } }) {
  const max = Math.max(...points.map((p) => p.revenue), 1);
  const peak = points.findIndex((p) => p.revenue === max);

  const running: number[] = [];
  points.reduce((sum, p) => {
    const next = sum + p.revenue;
    running.push(next);
    return next;
  }, 0);
  const total = running[running.length - 1] || 1;

  const W = 1000;
  const H = 100;
  const x = (i: number) => (points.length > 1 ? (i * W) / (points.length - 1) : W / 2);
  const y = (v: number) => H - (v / total) * (H - 6) - 3;

  /* Кривая, а не ломаная: накопление — величина непрерывная, и излом на
     каждом часе читался бы как рваные данные при ровных числах. */
  const line = running
    .map((v, i) => {
      if (i === 0) return `M${x(0)},${y(v)}`;
      const mid = (x(i - 1) + x(i)) / 2;
      return `C${mid},${y(running[i - 1])} ${mid},${y(v)} ${x(i)},${y(v)}`;
    })
    .join(' ');
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  /* Ключ пересобирает узлы при смене периода: без него линия не
     перерисовалась бы, а осталась бы от прошлого набора. */
  const shape = `${points.length}-${total}`;

  return (
    <div className={s.chart}>
      <div className={s.chartLegend}>
        <span>
          <i data-line aria-hidden />
          {labels.line}
        </span>
        <span>
          <i aria-hidden />
          {labels.bar}
        </span>
      </div>

      <div className={s.chartPlot}>
        <div className={s.chartBars}>
          {points.map((p, i) => (
            <span
              key={`${p.label}-${i}`}
              className={s.chartBar}
              data-peak={i === peak ? '' : undefined}
              style={
                { height: `${Math.max(3, (p.revenue / max) * 72)}%`, '--i': i } as CSSProperties
              }
            />
          ))}
        </div>

        <svg className={s.chartLine} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="landingFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path key={`a-${shape}`} className="day-area" d={area} fill="url(#landingFill)" />
          <path
            key={`l-${shape}`}
            className="day-line"
            d={line}
            pathLength={1}
            fill="none"
            stroke="var(--accent-strong)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      </div>

      <div className={s.chartAxis}>
        {points.map((p, i) =>
          i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2) ? (
            <span key={p.label}>{p.label}</span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Словарь показа. Отдельным именем, чтобы не таскать длинный путь. */
type Demo = ReturnType<typeof useT>['landing']['demo'];

/** Пять показателей периода — те же, что считает кабинет. */
type Totals = { count: number; revenue: number; payroll: number; costs: number; net: number };
