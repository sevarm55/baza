'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AuthTrigger } from '@/components/auth-buttons';
import { Figures } from './landing-board';
import { NumericText } from '@/components/patterns/numeric-text';
import { formatMoney } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { useT } from '@/lib/i18n/client';
import { fromOneUnit, staffCount, unitCount } from '@/lib/i18n/terms';
import { TRIAL_DAYS } from '@/lib/plan';
import { Chart } from './landing-chart';
import { shiftTime, useShift } from './landing-shift';
import { DEMO, DEMO_PERIODS, DEMO_RATE, type DemoOrder, type DemoPeriod } from './landing-demo';
import s from './landing.module.css';
import m from './landing-mobile.module.css';

/**
 * Витрина на телефоне.
 *
 * На компьютере страница и есть продукт: панель стоит справа и живёт
 * по мере чтения. На телефоне тот же приём работал против страницы —
 * продукт во всю ширину экрана читался не рассказом о системе, а самой
 * системой, будто человек уже внутри. Обещания перед ним не было.
 *
 * Поэтому телефонная витрина собрана как витрина: сначала обещание
 * крупным словом и кнопка, потом продукт — в рамке телефона, теми же
 * настоящими приборами, что и на компьютере. Рамка говорит «это
 * приложение, которое ты получишь», а не «ты уже в нём». Дальше —
 * три касания мойщика, день, зарплата и в конце единственное число,
 * ради которого всё считалось.
 *
 * ЧТО ЗДЕСЬ НАСТОЯЩЕЕ. Форма в рамке работает: номер можно вписать,
 * услугу выбрать, цену поменять — машина встанет в список, доля
 * исполнителя начислится по той же ставке. Показ при этом живёт сам:
 * доехав до рамки, витрина набирает номер и записывает машину.
 */

/** Валюта показа. Бизнес в Ереване берёт драмы — от языка это не зависит. */
const CURRENCY = 'AMD';

export function LandingMobile({
  /* Слова бизнеса приходят из конфига ниши — того же, что получает
     настоящий бизнес при регистрации. */
  unitOne,
  staffRole,
}: {
  unitOne: string;
  staffRole: string;
}) {
  const t = useT();
  const d = t.landing.demo;
  const money = (n: number) => formatMoney(n, CURRENCY, t.locale);
  const shift = useShift();

  return (
    <div className={m.story}>
      <Hero t={t} />

      {/* Продукт в рамке телефона: форма записи, которая набирает
          номер сама. Это первый кадр продукта и главный аргумент —
          он идёт сразу под обещанием. */}
      <section className={m.feature} aria-label={d.taps}>
        <PhoneFrame title={d.business} badge={d.demoBadge}>
          <Units d={d} money={money} shift={shift} />
        </PhoneFrame>
        <span className={m.mark} id="mob-demo-shown" aria-hidden />
      </section>

      {/* Три касания — вся механика продуктa одной строкой. */}
      <Taps d={d} />

      <Feature beat={t.landing.beats[1]}>
        <PhoneFrame title={t.common.today}>
          <Day d={d} t={t} money={money} shift={shift} unitOne={unitOne} staffRole={staffRole} />
        </PhoneFrame>
      </Feature>

      <Feature beat={t.landing.beats[2]}>
        <PhoneFrame title={d.team}>
          <Team d={d} t={t} money={money} shift={shift} />
        </PhoneFrame>
      </Feature>

      {/* Итог — без рамки и во всю ширину. Единственное место рассказа,
          где число стоит на своей заливке; так же устроен итог в
          кабинете, и второй раз этот приём на странице не звучит. */}
      <ResultBand>
        <Result d={d} t={t} money={money} shift={shift} />
      </ResultBand>

      {/* Метка конца рассказа для липкой кнопки: ниже цена со своей
          кнопкой, и плавающая шестая там не нужна. */}
      <span className={m.mark} id="mob-story-end" aria-hidden />
    </div>
  );
}

/* ══════════════════════════ обещание ══════════════════════════ */

/**
 * Первый экран. Заголовок страницы — им же она называется и на
 * компьютере; здесь он вернулся наверх, потому что рамка с продуктом
 * стоит прямо под ним и доказывает его двумя строками ниже.
 */
function Hero({ t }: { t: ReturnType<typeof useT> }) {
  const l = t.landing;

  return (
    <header className={m.hero}>
      <h1 className={m.heroTitle}>{l.hero.title}</h1>
      <p className={m.heroLead}>{l.hero.lead}</p>

      <div className={m.heroActions}>
        <AuthTrigger mode="register" className={`${s.cta} ${m.bigCta}`}>
          {l.hero.cta} <span aria-hidden="true">↗</span>
        </AuthTrigger>
        <span className={s.note}>{l.hero.note(TRIAL_DAYS)}</span>
      </div>
    </header>
  );
}

/* ─────────────────────── три касания ─────────────────────── */

/**
 * Вся механика в одной строке: номер → услуга → оплата. Слова те же,
 * что стоят подписями полей в форме выше, — шаг и поле называются
 * одинаково, потому что это одно и то же.
 */
function Taps({ d }: { d: Demo }) {
  const steps = [d.plate, d.service, d.payment];

  return (
    <div className={m.taps}>
      {steps.map((word, i) => (
        <span key={word} className={m.tap}>
          <b aria-hidden>{i + 1}</b>
          {word}
        </span>
      ))}
    </div>
  );
}

/* ─────────────────────── рамка телефона ─────────────────────── */

/**
 * Рамка, в которой показывается продукт.
 *
 * Это не макет устройства с чёлкой и не снимок: внутри стоит настоящий
 * прибор — та же форма, тот же список, те же числа, что у человека в
 * кабинете. Рамка нужна только для того, чтобы прочитать масштаб: вот
 * экран, на котором это будет жить.
 */
function PhoneFrame({
  title,
  badge,
  children,
}: {
  title: string;
  /** служебная плашка в шапке экрана — например «ЦУՑԱԴՐՈՒԹՅՈՒՆ» */
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className={m.phone}>
      <div className={m.screen}>
        {(title || badge) && (
          <div className={m.screenHead}>
            <span className={m.screenTitle}>{title}</span>
            {badge && <span className={m.screenBadge}>{badge}</span>}
          </div>
        )}
        <div className={m.screenBody}>{children}</div>
      </div>
    </div>
  );
}

/* ─────────────────────── шаг рассказа ─────────────────────── */

/**
 * Мысль и продукт под ней. Порядок прямой: фраза готовит к экрану,
 * который стоит ниже, — на телефоне видно один экран, и утверждение
 * надо прочитать до того, как смотреть на числа.
 */
function Feature({
  beat,
  children,
}: {
  beat: { title: string; body: string };
  children: ReactNode;
}) {
  return (
    <section className={m.feature}>
      <div className={m.copy}>
        <h2 className={m.copyTitle}>{beat.title}</h2>
        <p className={m.copyBody}>{beat.body}</p>
      </div>
      {children}
    </section>
  );
}

/* ══════════════════════════ запись ══════════════════════════ */

function Units({
  d,
  money,
  shift,
}: {
  d: Demo;
  money: (n: number) => string;
  shift: Shift;
}) {
  const [plate, setPlate] = useState('');
  const [service, setService] = useState(0);
  const [done, setDone] = useState<string | null>(null);
  /** Человек взялся за форму сам: показ дальше не набирает за него. */
  const own = useRef(false);

  /* Цены в форме нет: на телефоне показывают ровно три касания
     (номер, услуга, кнопка), а машина в списке стоит с той ценой,
     которой записана в данных смены. */
  const ready = plate.trim().length >= 4;

  const [watch, seen] = useSeen();

  /* Номер набирается сам, знак за знаком, и машина встаёт в список.
     Это и есть весь продукт в двух секундах: вписал, и оно посчиталось.

     В зависимостях именно `registered` и `setRegistered`, а не вся
     смена: `useShift` возвращает новый объект на каждую отрисовку, и
     набор, привязанный к нему, сбрасывал бы сам себя на каждом знаке. */
  const { registered, setRegistered } = shift;
  useEffect(() => {
    if (!seen || registered || own.current) return;
    const target = DEMO.fresh.plate;
    const timers: ReturnType<typeof setTimeout>[] = [];

    /* Тому, кто выключил движение, номер не набирается по знаку: запись
       просто появляется — короткая пауза оставляет причину и следствие
       раздельными, а движения в ней нет. */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      timers.push(
        setTimeout(() => {
          if (own.current) return;
          setRegistered(true);
          setDone(target);
        }, 500),
      );
      return () => timers.forEach(clearTimeout);
    }

    for (let i = 1; i <= target.length; i++) {
      timers.push(setTimeout(() => !own.current && setPlate(target.slice(0, i)), 420 + i * 62));
    }
    timers.push(
      setTimeout(() => {
        if (own.current) return;
        setRegistered(true);
        setDone(target);
        setPlate('');
      }, 420 + target.length * 62 + 420),
    );
    return () => timers.forEach(clearTimeout);
  }, [seen, registered, setRegistered]);

  return (
    <div ref={watch}>
      <form
        className={m.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const key = plate.trim().toUpperCase();
          shift.addUnit({
            time: shiftTime(shift.extra.length),
            plate: key,
            service,
            payment: 0,
            staff: 0,
            price: DEMO.fresh.price,
          });
          setDone(key);
          setPlate('');
        }}
      >
        <div className={m.field}>
          <label htmlFor="mob-plate">{d.plate}</label>
          <input
            id="mob-plate"
            className="field num"
            value={plate}
            onChange={(e) => {
              own.current = true;
              setPlate(e.target.value);
            }}
            placeholder={d.platePlaceholder}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
          />
        </div>

        <Segmented
          label={d.service}
          id="mob-service"
          options={d.services}
          value={service}
          onPick={setService}
        />

        <button type="submit" className={m.submit} disabled={!ready}>
          {d.add}
        </button>

        {done && (
          <p className={m.done} key={done} role="status">
            <span aria-hidden>✓</span>
            <b>{done}</b> {d.registered}
          </p>
        )}
      </form>

      <Rows d={d} orders={shift.orders.slice(0, 3)} money={money} />
    </div>
  );
}

/* ══════════════════════════ день ══════════════════════════ */

function Day({
  d,
  t,
  money,
  shift,
  unitOne,
  staffRole,
}: {
  d: Demo;
  t: Dict;
  money: (n: number) => string;
  shift: Shift;
  unitOne: string;
  staffRole: string;
}) {
  const { today, hours, crew, setRegistered } = shift;
  const kept = today.revenue > 0 ? Math.round((today.net / today.revenue) * 100) : 0;
  const perUnit = today.count > 0 ? Math.round(today.net / today.count) : 0;
  const onShift = crew.filter((c) => c.onShift).length;

  /* Кто пролистал рамку с записью рывком, всё равно видит день с уже
      записанной машиной: сводка не может стоять на «до», если выше
      машина уже встала в список. */
  const ensure = useCallback(() => setRegistered(true), [setRegistered]);

  const [watch] = useSeen(ensure);

  return (
    <div ref={watch}>
      <div className={m.reading}>
        <span className={m.readingLabel}>{t.owner.profit}</span>
        <strong className={m.readingValue}>
          <NumericText>{money(today.net)}</NumericText>
        </strong>
        <span className={m.readingNote}>
          {kept}% {t.owner.kept} · {money(perUnit)} {fromOneUnit(unitOne, t.locale)}
        </span>
      </div>

      <div className={m.metrics}>
        <Figures
          items={[
            { label: t.owner.revenue, value: money(today.revenue) },
            { label: t.owner.payrollAccrued, value: money(today.payroll), sign: '−' },
            { label: t.expenses.title, value: money(today.costs), sign: '−' },
          ]}
        />
      </div>

      <p className={m.quick}>
        <span>{unitCount(today.count, unitOne, t.locale)}</span>
        <span>
          {staffCount(onShift, staffRole, t.locale)} {d.onShift}
        </span>
      </p>

      <div className={m.block}>
        <Chart
          points={hours}
          labels={{ line: t.today.accumulated, bar: t.today.inHour }}
          plot={210}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════ команда ══════════════════════════ */

function Team({
  d,
  t,
  money,
  shift,
}: {
  d: Demo;
  t: Dict;
  money: (n: number) => string;
  shift: Shift;
}) {
  return (
    <>
      <div className="board-journal">
        {shift.crew.map((person, i) => {
          const name = d.crew[i];
          const color = personColor(name);
          return (
            <div key={i} className={m.person}>
              <span
                className={`${m.dot} ${person.onShift ? '' : m.dotOff}`}
                style={{ background: color, color }}
                aria-hidden
              />
              <span className={m.personMain}>
                <span className={m.personName}>{name}</span>
                <span className={m.personMeta}>
                  {person.count} · {d.brought} {money(person.revenue)}
                </span>
              </span>
              <span className={m.personMoney}>
                <span className={m.personEarned}>
                  <NumericText>{money(person.earned)}</NumericText>
                </span>
                <span className={m.personRate}>
                  {DEMO_RATE}% {d.rate}
                </span>
              </span>
            </div>
          );
        })}
      </div>

      <div className={m.sum}>
        <span>{t.owner.payrollDue}</span>
        <b className="num">
          <NumericText>{money(shift.today.payroll)}</NumericText>
        </b>
      </div>
    </>
  );
}

/* ══════════════════════════ итог ══════════════════════════ */

/**
 * Тёмная плита во всю ширину — финал рассказа. Один расчёт за сегодня,
 * неделю и месяц; выбор периода остаётся живым, потому что это тот же
 * прибор, что в отчёте кабинета.
 */
function ResultBand({ children }: { children: ReactNode }) {
  return <div className={`board ${m.band}`}>{children}</div>;
}

function Result({
  d,
  t,
  money,
  shift,
}: {
  d: Demo;
  t: Dict;
  money: (n: number) => string;
  shift: Shift;
}) {
  const [period, setPeriod] = useState<DemoPeriod>('today');
  /* Сегодняшний день складывается на месте из живой смены — той же,
     что записана в рамке выше. Неделя и месяц уже закрыты. */
  const report =
    period === 'today'
      ? { totals: shift.today, points: shift.hours }
      : DEMO.periods[period];

  return (
    <>
      <div className={m.periods} role="group" aria-label={d.report}>
        {DEMO_PERIODS.map((key, i) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            className={m.periodItem}
            data-on={period === key ? '' : undefined}
            onClick={() => setPeriod(key)}
          >
            {d.periods[i]}
          </button>
        ))}
      </div>

      <div className={m.result}>
        <strong className={m.resultValue}>
          <NumericText>{money(report.totals.net)}</NumericText>
        </strong>
        <span className={m.resultNote}>{t.owner.profit}</span>

        <div className={m.resultLines}>
          <p>
            <span>{t.owner.revenue}</span>
            <b className="num">
              <NumericText>{money(report.totals.revenue)}</NumericText>
            </b>
          </p>
          <p>
            <span>{t.owner.payrollAccrued}</span>
            <b className="num">
              − <NumericText>{money(report.totals.payroll)}</NumericText>
            </b>
          </p>
          <p>
            <span>{t.expenses.title}</span>
            <b className="num">
              − <NumericText>{money(report.totals.costs)}</NumericText>
            </b>
          </p>
        </div>

        <Spark points={report.points} />
      </div>
    </>
  );
}

/**
 * Ход периода одной линией. Полный график с рельефом и осью на тёмной
 * плите не нужен: рядом стоят все его числа, а линия отвечает на
 * единственный оставшийся вопрос — ровно ли шёл период.
 */
function Spark({ points }: { points: { label: string; revenue: number }[] }) {
  const running: number[] = [];
  points.reduce((sum, p) => {
    const next = sum + p.revenue;
    running.push(next);
    return next;
  }, 0);
  const total = running[running.length - 1] || 1;

  const W = 300;
  const H = 44;
  const x = (i: number) => (points.length > 1 ? (i * W) / (points.length - 1) : W / 2);
  const y = (v: number) => H - (v / total) * (H - 6) - 3;

  const line = running
    .map((v, i) => {
      if (i === 0) return `M${x(0)},${y(v)}`;
      const mid = (x(i - 1) + x(i)) / 2;
      return `C${mid},${y(running[i - 1])} ${mid},${y(v)} ${x(i)},${y(v)}`;
    })
    .join(' ');

  return (
    <svg className={m.spark} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden>
      <path
        key={`${points.length}-${total}`}
        className="day-line"
        d={line}
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/* ══════════════════════════ общие детали ══════════════════════════ */

/**
 * Выбор из трёх — сегментами во всю ширину. Доли равны, и попасть в
 * любую можно не глядя: пальцу нужна цель, а не строка.
 */
function Segmented({
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
    <div className={m.field}>
      <span id={id}>{label}</span>
      <div className={m.seg} role="radiogroup" aria-labelledby={id}>
        {options.map((name, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i}
            className={m.segItem}
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

/**
 * Список машин строками, а не таблицей. Строка отвечает сверху вниз:
 * что записали и за сколько, а под этим — когда, кто и что делали.
 */
function Rows({
  d,
  orders,
  money,
}: {
  d: Demo;
  orders: DemoOrder[];
  money: (n: number) => string;
}) {
  return (
    <div className="board-journal">
      {orders.map((o, i) => {
        const name = d.crew[o.staff];
        return (
          <div key={`${o.plate}-${o.time}`} className={`${m.row} ${i === 0 ? m.rowFresh : ''}`}>
            <span className={m.rowKey}>{o.plate}</span>
            <span className={m.rowMoney}>{money(o.price)}</span>
            <span className={m.rowNote}>
              <i style={{ background: personColor(name) }} aria-hidden />
              {o.time} · {name} · {d.services[o.service]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Липкая кнопка внизу экрана.
 *
 * Появляется после того, как продукт показали в рамке: до этого просить
 * не за что. И уходит, когда рассказ кончился — дальше у цены, магазина
 * и итога свои кнопки есть, и плавающая поверх них превращается в
 * полосу, которая просто закрывает страницу.
 */
export function MobileCta({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const after = document.getElementById('mob-demo-shown');
    const end = document.getElementById('mob-story-end');
    if (!after || !end) return;

    let shown = false;
    let ending = false;
    const sync = () => setOn(shown && !ending);

    /* Метка продукта: кнопка нужна, когда рамка уехала вверх. Читается
       положение узла, а не сам факт пересечения, — иначе кнопка
       появлялась бы и на пути к ней, ещё до неё. */
    const demo = new IntersectionObserver(([e]) => {
      shown = e.boundingClientRect.top < 0;
      sync();
    });
    demo.observe(after);

    /* Конец рассказа. Поле наблюдения вытянуто вверх на всю страницу
       нарочно — метка остаётся «достигнутой» и после того, как уехала
       под верх экрана. Признак обратимый: поднялись обратно к рамке —
       кнопка снова на месте. */
    const stop = new IntersectionObserver(
      ([e]) => {
        ending = e.isIntersecting;
        sync();
      },
      { rootMargin: '200000px 0px 0px 0px' },
    );
    stop.observe(end);

    return () => {
      demo.disconnect();
      stop.disconnect();
    };
  }, []);

  return (
    <div className={m.sticky} data-on={on ? '' : undefined} aria-hidden={!on}>
      {children}
    </div>
  );
}

/**
 * «Этот кусок страницы попал на глаза».
 *
 * Полоса срабатывания поднята от низа экрана: сцена начинает жить, когда
 * человек её уже видит, а не когда она только показалась краем. Один
 * раз — назад продукт не отматывается.
 *
 * Наблюдатель заводится ссылкой-обработчиком, а не эффектом по
 * `ref.current`: узел успевает отцепиться и прицепиться заново, а эффект
 * в этот миг видит пустую ссылку. Обработчик же вызывается ровно тогда,
 * когда узел есть.
 */
function useSeen(
  /** что сделать сразу, не дожидаясь новой отрисовки; ссылка должна быть постоянной */
  onSeen?: () => void,
): [(el: HTMLElement | null) => (() => void) | void, boolean] {
  const [seen, setSeen] = useState(false);

  const watch = useCallback(
    (el: HTMLElement | null) => {
      if (!el) return;
      const io = new IntersectionObserver(
        ([e]) => {
          if (!e.isIntersecting) return;
          setSeen(true);
          onSeen?.();
          io.disconnect();
        },
        { rootMargin: '0px 0px -25% 0px' },
      );
      io.observe(el);
      return () => io.disconnect();
    },
    [onSeen],
  );

  return [watch, seen];
}

/** Словарь показа. Отдельным именем, чтобы не таскать длинный путь. */
type Dict = ReturnType<typeof useT>;
type Demo = Dict['landing']['demo'];
type Shift = ReturnType<typeof useShift>;
