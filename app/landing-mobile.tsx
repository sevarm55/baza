'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Figures } from './landing-board';
import { NumericText } from '@/components/patterns/numeric-text';
import { formatMoney } from '@/lib/money';
import { personColor } from '@/lib/person-color';
import { useT } from '@/lib/i18n/client';
import { fromOneUnit, staffCount, unitCount } from '@/lib/i18n/terms';
import { Chart } from './landing-chart';
import { Pitch } from './landing-pitch';
import { shiftTime, useShift } from './landing-shift';
import { DEMO, DEMO_PERIODS, DEMO_RATE, type DemoOrder, type DemoPeriod } from './landing-demo';
import m from './landing-mobile.module.css';

/**
 * Витрина на телефоне.
 *
 * Это не настольная композиция, ужатая до трёхсот семидесяти пяти точек,
 * а вторая композиция того же продукта. На компьютере рассказ идёт слева,
 * а панель стоит справа и перестраивается; на телефоне липкая панель
 * забрала бы половину экрана, которой нельзя пользоваться, а полоса из
 * пяти вкладок — всю ширину ради переключателя.
 *
 * Поэтому здесь у дня прямой порядок: мысль, потом кусок продукта, о
 * котором она сказана, потом следующая мысль. Человек листает не рассказ
 * о Tetrin, а сам Tetrin сверху вниз.
 *
 * Общее с настольной композицией: данные смены, арифметика
 * (`landing-shift.ts`), приборы продукта и график (`landing-chart.tsx`).
 * Разная только геометрия — так и задумано.
 *
 * ЧТО ЗДЕСЬ НАСТОЯЩЕЕ. Формы работают. Номер можно вписать свой, услугу
 * выбрать, цену поменять — машина встанет в список, счётчик подрастёт,
 * доля исполнителя начислится по той же ставке, «вам остаётся»
 * пересчитается. То же с расходом.
 *
 * Что происходит само, без единого нажатия: доехав до первой сцены,
 * витрина набирает номер и записывает машину, а доехав до расходов —
 * вписывает воду. Витрину листают, а не изучают, и механику продукта
 * обязан увидеть даже тот, кто просто скроллит.
 */

/** Валюта показа. Бизнес в Ереване берёт драмы — от языка это не зависит. */
const CURRENCY = 'AMD';

/** Сцены телефона — те же пять, что на компьютере, и в том же порядке. */
const SCENES = 5;

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
  const [period, setPeriod] = useState<DemoPeriod>('today');

  const beats = t.landing.beats;
  const report =
    period === 'today'
      ? { totals: shift.today, points: shift.hours }
      : DEMO.periods[period];

  return (
    <div className={m.story}>
      <Scene index={0} beat={beats[0]}>
        <Units d={d} money={money} shift={shift} />
      </Scene>

      <Scene index={1} beat={beats[1]}>
        <Today d={d} t={t} money={money} shift={shift} unitOne={unitOne} staffRole={staffRole} />
      </Scene>

      <Scene index={2} beat={beats[2]}>
        <Team d={d} t={t} money={money} shift={shift} />
      </Scene>

      <Scene index={3} beat={beats[3]}>
        <Costs d={d} t={t} money={money} shift={shift} />
      </Scene>

      <Scene index={4} beat={beats[4]}>
        <Result
          d={d}
          t={t}
          money={money}
          period={period}
          onPeriod={setPeriod}
          totals={report.totals}
          points={report.points}
        />
      </Scene>
    </div>
  );
}

/* ══════════════════════════ каркас сцены ══════════════════════════ */

/**
 * Один шаг дня: мысль на полотне страницы, продукт под ней на полотне
 * кабинета.
 *
 * Продукт идёт от края до края экрана. Внешней карточки у него нет
 * намеренно: карточка вокруг панели, внутри которой лежит ещё панель,
 * съедает на телефоне по восемнадцать точек с каждой стороны на каждом
 * уровне, и продукт, ради которого страницу открыли, оказывается уже
 * собственного экрана.
 */
function Scene({
  index,
  beat,
  children,
}: {
  index: number;
  beat: { label: string; title: string; body: string };
  children: ReactNode;
}) {
  /* Первая сцена идёт наоборот: сначала продукт, потом слова.
     Страница открывается тем, ради чего её открыли, а не рассказом о
     нём; объяснять записанную на глазах машину проще после того, как
     её записали. Дальше порядок обычный: фраза готовит к экрану,
     который под ней. */
  const first = index === 0;

  const copy = (
    <div className={m.copy}>
      {/* Указатель шага вместо полосы вкладок. Пять больших вкладок
          борются за ширину телефона и всё равно не помещаются, а
          ответить должны они на один вопрос: где я в рассказе. */}
      <p className={m.step}>
        <b>{String(index + 1).padStart(2, '0')}</b>
        <span aria-hidden>/ {String(SCENES).padStart(2, '0')}</span>
        <em>{beat.label}</em>
      </p>
      <span
        className={m.track}
        style={{ '--at': `${((index + 1) / SCENES) * 100}%` } as CSSProperties}
        aria-hidden
      />

      <h2 className={m.title}>{beat.title}</h2>
      <p className={m.body}>{beat.body}</p>
    </div>
  );

  const band = <div className={`board ${m.band}`}>{children}</div>;

  return (
    <section className={m.scene} data-first={first ? '' : undefined}>
      {first ? band : copy}
      {first ? copy : band}
      {first && <Pitch />}

      {/* Метка «продукт показан и о нём рассказано». По ней внизу экрана
          появляется липкая кнопка — ниже обещания со своей кнопкой, а не
          поверх него. Метка занимает пиксель, а не ноль: у пустого
          строчного узла нет площади, и наблюдатель пересечений по нему
          больше ни разу не срабатывает. */}
      {first && <span className={m.mark} id="mob-demo-shown" aria-hidden />}
    </section>
  );
}

/** Заголовок куска продукта: что это за экран и что на нём происходит. */
function Head({ title, live }: { title: string; live?: string }) {
  return (
    <div className={m.head}>
      <h3 className={m.headTitle}>{title}</h3>
      {live && (
        <span className={m.live}>
          <i aria-hidden />
          {live} · {DEMO.now}
        </span>
      )}
    </div>
  );
}

/* ══════════════════════════ 01 · запись ══════════════════════════ */

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
  const [price, setPrice] = useState('8000');
  const [done, setDone] = useState<string | null>(null);
  /** Человек взялся за форму сам: показ дальше не набирает за него. */
  const own = useRef(false);

  const amount = Number(price.replace(/\D/g, ''));
  const ready = plate.trim().length >= 4 && amount > 0;

  const [watch, seen] = useSeen();

  /* Номер набирается сам, знак за знаком, и машина встаёт в список.
     Это и есть весь продукт в двух секундах: вписал, и оно посчиталось.
     Форма при этом живая — тот, кто тронул её сам, дальше набирает
     своё, и показ ему не мешает.

     В зависимостях именно `registered` и `setRegistered`, а не вся
     смена: `useShift` возвращает новый объект на каждую отрисовку, и
     набор, привязанный к нему, сбрасывал бы сам себя на каждом знаке —
     номер не набирался бы никогда. */
  const { registered, setRegistered } = shift;
  useEffect(() => {
    if (!seen || registered || own.current) return;
    const target = DEMO.fresh.plate;
    const timers: ReturnType<typeof setTimeout>[] = [];

    /* Тому, кто выключил движение, номер не набирается по знаку: запись
       просто появляется. Не мгновенно — короткая пауза оставляет
       причину и следствие раздельными, а движения в ней нет. */
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
      <Head title={d.nav.units} live={d.live} />

      <form
        className={m.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (!ready) return;
          const key = plate.trim().toUpperCase();
          shift.addUnit({
            /* Время следующей записи — через три минуты после предыдущей.
               От часов браузера оно не зависит: смена показана целиком, и
               запись, помеченная сегодняшним «сейчас», выпала бы из неё. */
            time: shiftTime(shift.extra.length),
            plate: key,
            service,
            /* Оплата на телефоне не спрашивается: в форме и так три
               поля, а наличными на мойке платят почти всегда. Спросить
               её можно в самом продукте — здесь показывают, сколько
               нужно движений, а не сколько есть полей. */
            payment: 0,
            staff: 0,
            price: amount,
          });
          setDone(key);
          setPlate('');
        }}
      >
        <div className={m.formHead}>{d.newUnit}</div>

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

        <div className={m.field}>
          <label htmlFor="mob-price">{d.price}</label>
          <input
            id="mob-price"
            className="field num"
            inputMode="numeric"
            value={price}
            onChange={(e) => {
              own.current = true;
              setPrice(e.target.value.replace(/\D/g, '').slice(0, 7));
            }}
            autoComplete="off"
          />
        </div>

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

      {/* Две цифры строкой, а не двумя плитками: это подпись к списку
          под ними, а не второе показание дня. */}
      <p className={m.quick}>
        <span>
          {d.units} <b className="num">{String(shift.today.count)}</b>
        </span>
        <span>
          {d.avgCheck}{' '}
          <b className="num">
            {money(Math.round(shift.today.revenue / Math.max(1, shift.today.count)))}
          </b>
        </span>
      </p>

      <Rows d={d} orders={shift.orders.slice(0, 3)} money={money} />
    </div>
  );
}

/* ══════════════════════════ 02 · день ══════════════════════════ */

function Today({
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
  const { today, hours, crew, orders, setRegistered } = shift;
  /* Доля и «с одной машины» — ровно те же две подписи, что стоят под
     плитой в кабинете, и считаются они здесь так же. */
  const kept = today.revenue > 0 ? Math.round((today.net / today.revenue) * 100) : 0;
  const perUnit = today.count > 0 ? Math.round(today.net / today.count) : 0;
  const onShift = crew.filter((c) => c.onShift).length;

  /* Кто пролистал первую сцену рывком, всё равно видит день с уже
     записанной машиной. Иначе сводка стоит на «до», а стоит человеку
     отмотать назад — числа под ним меняются сами: рассказ о точности
     подсчёта не может позволить себе такой фокус. */
  const ensure = useCallback(() => setRegistered(true), [setRegistered]);
  const [watch] = useSeen(ensure);

  return (
    <div ref={watch}>
      <Head title={t.common.today} live={d.live} />

      {/* Показание дня — числом на полотне, без плиты вокруг.
          Тёмная плита здесь отобрала бы силу у итога в конце рассказа:
          на телефоне их видно по одному, и вторая такая же читается как
          повтор, а не как вывод. */}
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

      {/* Операционные подписи разведены по местам, к которым относятся:
          масштаб дня стоит под слагаемыми, средний чек — под графиком.
          Втроём в одну строку они на телефоне не помещаются, а
          перенесённая строка меты начинается с точки-разделителя и
          читается пунктом списка. */}
      <p className={m.quick}>
        <span>{unitCount(today.count, unitOne, t.locale)}</span>
        <span>
          {staffCount(onShift, staffRole, t.locale)} {d.onShift}
        </span>
      </p>

      {/* График отдельным блоком во всю ширину, а не рядом со списком:
          на телефоне две колонки превращают ход дня в полоску, по
          которой нельзя прочитать ни час заезда, ни накопление. */}
      <div className={m.block}>
        <h4 className={m.blockTitle}>{d.flow}</h4>
        <Chart
          points={hours}
          labels={{ line: t.today.accumulated, bar: t.today.inHour }}
          plot={230}
        />
        <p className={m.quick}>
          <span>
            {d.avgCheck}{' '}
            <b className="num">{money(Math.round(today.revenue / Math.max(1, today.count)))}</b>
          </span>
        </p>
      </div>

      <div className={m.block}>
        <h4 className={m.blockTitle}>
          {d.lastUnits}
          <span className="num">{today.count}</span>
        </h4>
        <Rows d={d} orders={orders.slice(0, 4)} money={money} />
        <p className={m.more}>
          {t.today.all} <span aria-hidden>→</span>
        </p>
      </div>
    </div>
  );
}

/* ══════════════════════════ 03 · команда ══════════════════════════ */

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
      <Head title={d.team} />
      <p className={m.hint}>{d.autoPayroll}</p>

      {/* Карточки вокруг каждого человека нет: три карточки подряд на
          телефоне читаются стопкой предметов, а это список. Разделяют
          их волосяные линии и набор. */}
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

/* ══════════════════════════ 04 · расходы ══════════════════════════ */

function Costs({
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
  const [category, setCategory] = useState(3);
  const [amount, setAmount] = useState('18000');
  const [note, setNote] = useState('');

  const value = Number(amount.replace(/\D/g, ''));
  const total = shift.spend.reduce((n, c) => n + c.amount, 0);

  const [watch, seen] = useSeen();

  /* Вода за август вписывается сама — как и машина на первой сцене.
     Показывают здесь не форму, а то, что происходит после неё.
     Зависимости прицельные по той же причине, что и там. */
  const { waterLogged, setWaterLogged } = shift;
  useEffect(() => {
    if (!seen || waterLogged) return;
    const id = setTimeout(() => setWaterLogged(true), 700);
    return () => clearTimeout(id);
  }, [seen, waterLogged, setWaterLogged]);

  /* Переход между двумя настоящими состояниями смены: было столько,
     вписали воду — стало столько. Пока ничего не вписано, показывать
     нечего, и блока нет. */
  const moved = shift.netBefore !== shift.today.net;

  return (
    <div ref={watch}>
      <Head title={t.expenses.title} />

      <form
        className={m.form}
        onSubmit={(e) => {
          e.preventDefault();
          if (value <= 0) return;
          shift.addCost({ category, amount: value });
          setAmount('');
        }}
      >
        <div className={m.formHead}>{d.newCost}</div>

        <Segmented
          label={d.category}
          id="mob-category"
          options={d.categories}
          value={category}
          onPick={setCategory}
        />

        <div className={m.field}>
          <label htmlFor="mob-amount">{d.amount}</label>
          <input
            id="mob-amount"
            className="field num"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/\D/g, '').slice(0, 9))}
            autoComplete="off"
          />
        </div>

        <div className={m.field}>
          <label htmlFor="mob-note">{d.comment}</label>
          <input
            id="mob-note"
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={d.commentPlaceholder}
            maxLength={40}
            autoComplete="off"
          />
        </div>

        <button type="submit" className={m.submit} disabled={value <= 0}>
          {d.addCost}
        </button>
      </form>

      {moved && (
        <div className={m.moved} role="status">
          <span className={m.movedFrom}>{money(shift.netBefore)}</span>
          <span className={m.movedArrow} aria-hidden>
            ↓
          </span>
          <strong className={m.movedTo}>
            <NumericText>{money(shift.today.net)}</NumericText>
          </strong>
          <span className={m.movedNote}>{d.netBecomes}</span>
        </div>
      )}

      <div className={m.block}>
        <h4 className={m.blockTitle}>
          {d.costsToday}
          <span className="num">{shift.spend.length}</span>
        </h4>

        <div className="board-journal">
          {shift.spend.map((c, i) => (
            /* Столбца времени у расхода нет: его вписывают за день, а не
               в минуту. */
            <div
              key={`${c.category}-${i}`}
              className={`${m.row} ${m.rowFlat} ${i >= DEMO.spend.length ? m.rowFresh : ''}`}
            >
              <span className={m.rowKey}>{d.categories[c.category]}</span>
              <span className={m.rowMoney}>− {money(c.amount)}</span>
            </div>
          ))}
        </div>

        <div className={m.sum}>
          <span>{t.common.total}</span>
          <b className="num">
            <NumericText>{money(total)}</NumericText>
          </b>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════ 05 · итог ══════════════════════════ */

/**
 * Тёмная панель во всю ширину — телефонный ответ настольной плите.
 *
 * Это единственное место рассказа, где число стоит на своей заливке.
 * Так же устроен итог в кабинете и в отчёте на компьютере: цвет здесь
 * говорит «это ответ», и второй раз на странице он не звучит.
 */
function Result({
  d,
  t,
  money,
  period,
  onPeriod,
  totals,
  points,
}: {
  d: Demo;
  t: Dict;
  money: (n: number) => string;
  period: DemoPeriod;
  onPeriod: (next: DemoPeriod) => void;
  totals: { count: number; revenue: number; payroll: number; costs: number; net: number };
  points: { label: string; revenue: number }[];
}) {
  return (
    <>
      <Head title={d.report} />

      <div className={m.periods} role="group" aria-label={d.report}>
        {DEMO_PERIODS.map((key, i) => (
          <button
            key={key}
            type="button"
            aria-pressed={period === key}
            className={m.periodItem}
            data-on={period === key ? '' : undefined}
            onClick={() => onPeriod(key)}
          >
            {d.periods[i]}
          </button>
        ))}
      </div>

      <div className={m.result}>
        <span className={m.resultLabel}>{d.periods[DEMO_PERIODS.indexOf(period)]}</span>
        <strong className={m.resultValue}>
          <NumericText>{money(totals.net)}</NumericText>
        </strong>
        <span className={m.resultNote}>{t.owner.profit}</span>

        <div className={m.resultLines}>
          <p>
            <span>{t.owner.revenue}</span>
            <b className="num">
              <NumericText>{money(totals.revenue)}</NumericText>
            </b>
          </p>
          <p>
            <span>{t.owner.payrollAccrued}</span>
            <b className="num">
              − <NumericText>{money(totals.payroll)}</NumericText>
            </b>
          </p>
          <p>
            <span>{t.expenses.title}</span>
            <b className="num">
              − <NumericText>{money(totals.costs)}</NumericText>
            </b>
          </p>
        </div>

        <Spark points={points} />
      </div>
    </>
  );
}

/**
 * Ход периода одной линией.
 *
 * На тёмной панели полный график с рельефом и осью не помещается и не
 * нужен: рядом стоят все его числа, а линия отвечает на единственный
 * оставшийся вопрос — ровно ли шёл период.
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
 * Выбор из трёх-четырёх — сегментами во всю ширину.
 *
 * На компьютере это чипы, которые становятся в строку по своей ширине.
 * Пальцу нужна цель, а не строка: сегменты равной доли попадают под
 * палец не глядя и не зависят от того, какой длины слово в языке.
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
 * Список машин строками, а не таблицей.
 *
 * Столбцы на телефоне превращаются в четыре узких колонки, из которых
 * читается одна. Строка отвечает сверху вниз: что записали и за сколько,
 * а под этим — когда, кто и что делали.
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
          <div
            key={`${o.plate}-${o.time}`}
            className={`${m.row} ${i === 0 ? m.rowFresh : ''}`}
          >
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
 * Появляется только после того, как продукт показали: до этого просить
 * не за что. И уходит навсегда, как только человек доехал до цены —
 * дальше своя кнопка есть у каждого раздела, и плавающая над ними
 * шестая превращается в полосу, которая просто закрывает страницу.
 */
export function MobileCta({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const after = document.getElementById('mob-demo-shown');
    const price = document.getElementById('price');
    if (!after || !price) return;

    let shown = false;
    let ending = false;
    const sync = () => setOn(shown && !ending);

    /* Метка продукта: кнопка нужна, когда первая сцена уехала вверх.
       Читается положение узла, а не сам факт пересечения, — иначе
       кнопка появлялась бы и на пути к сцене, ещё до неё. */
    const demo = new IntersectionObserver(([e]) => {
      shown = e.boundingClientRect.top < 0;
      sync();
    });
    demo.observe(after);

    /* Ниже цены липкой кнопки нет: там своя есть у каждого раздела.
       Поле наблюдения вытянуто вверх на всю страницу нарочно — цена
       остаётся «достигнутой» и после того, как уехала под верх экрана.
       Без этого кнопка возвращалась бы поверх магазина приложений, где
       под ней уже лежит знак App Store. Признак при этом обратимый:
       поднялись обратно к рассказу — кнопка снова на месте. */
    const end = new IntersectionObserver(
      ([e]) => {
        ending = e.isIntersecting;
        sync();
      },
      { rootMargin: '200000px 0px 0px 0px' },
    );
    end.observe(price);

    return () => {
      demo.disconnect();
      end.disconnect();
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
 * `ref.current`. Эффект и присоединение узла к ссылке — два разных
 * момента отрисовки, и их порядок разработчику не принадлежит: узел
 * успевает отцепиться и прицепиться заново, а эффект в этот миг видит
 * пустую ссылку, ничего не заводит и больше не повторяется. Обработчик
 * же вызывается ровно тогда, когда узел есть.
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
