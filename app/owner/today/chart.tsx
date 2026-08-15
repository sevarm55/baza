'use client';

import { useState, type CSSProperties } from 'react';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import type { FlowEvent, FlowPoint } from './model';

/**
 * Ход периода: сколько накопилось, когда пришло и что именно приехало.
 *
 * Здесь три вопроса, и они разные. «Как идёт день» — это накопление:
 * линия растёт, и по её наклону видно, догоняет день вчерашний или
 * отстаёт. «Когда у меня заезд» — это рельеф: где столбик выше, туда и
 * приходят, а провал между ними и есть тот час, в который мойка стояла.
 * «Что именно приехало» — полоса времени под полем: на ней стоят сами
 * записи, каждая в свою минуту, и последняя помечена лаймом.
 *
 * Полоса добавлена ПОВЕРХ обычного графика, а не вместо него. Пробовали
 * наоборот — голая ось с точками вместо столбиков и линии: выглядело
 * узнаваемо и не отвечало ни на один вопрос, половина прибора
 * оставалась белой. Столбики говорят «сколько за час», линия — «сколько
 * всего к этому часу», точки — «вот они, машины, по одной». Провал в
 * дне после этого виден дважды.
 *
 * Линия рисуется в SVG, а столбики остаются блоками. Смешение нарочное:
 * растянутый по ширине SVG искажает толщину штриха, и лечится это
 * `vector-effect`, а вот прямоугольники блоками тянутся без искажений
 * вовсе и остаются чёткими на любом экране.
 *
 * Чего здесь нет — итога дня крупной цифрой. Он стоит на плите наверху
 * страницы, и вторая такая же цифра в заголовке графика заставляла
 * сверять два числа вместо того, чтобы прочитать одно. График отвечает
 * не «сколько», а «когда».
 */
export function FlowChart({
  points,
  events,
  currency,
  unitOne,
  byHour,
}: {
  points: FlowPoint[];
  /** настоящие операции на полосе времени под полем */
  events: FlowEvent[];
  currency: string;
  unitOne: string;
  /** день по часам или период по дням: от этого зависят подписи */
  byHour: boolean;
}) {
  /* Что под курсором. `null` — курсора нет, и тогда подпись внизу
     показывает пик: экран, на который просто смотрят, обязан отвечать
     без наведения. */
  const [at, setAt] = useState<number | null>(null);
  /* Операция под курсором — состояние отдельное от часа: полоса времени
     живёт своей жизнью под полем, и наведение на точку не должно
     сбивать чтение часа над ней. */
  const [ev, setEv] = useState<number | null>(null);

  if (points.length === 0) return null;

  const money = (n: number) => formatMoney(n, currency);
  const max = Math.max(...points.map((p) => p.value));
  const peakIndex = Math.max(
    0,
    points.findIndex((p) => p.value === max && max > 0),
  );

  /* Накопление считается один раз и здесь: то же самое в разметке
     превратилось бы в сумму, пересчитываемую на каждой точке. */
  const running: number[] = [];
  points.reduce((sum, p) => {
    const next = sum + p.value;
    running.push(next);
    return next;
  }, 0);
  const total = running[running.length - 1] ?? 0;

  const W = 1000;
  const H = 260;
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const y = (v: number) => (total > 0 ? H - (v / total) * (H - 12) - 6 : H - 6);
  const x = (i: number) => (points.length > 1 ? i * step : W / 2);

  /* Кривая, а не ломаная.

     Накопление — величина непрерывная: за час деньги не прыгают
     ступенькой, они набегают. Ломаная из отрезков рисовала на каждом
     часе излом, и график читался как рваный, хотя данные ровные.

     Сглаживаем половинным шагом: опорные точки кубики стоят на середине
     между узлами и на высоте своих узлов. Такая кривая по построению не
     может уйти выше следующего значения или ниже предыдущего — для
     накопления это обязательное свойство, иначе линия покажет падение
     выручки там, где его не было. */
  const line = running
    .map((v, i) => {
      if (i === 0) return `M${x(0)},${y(v)}`;
      const px = x(i - 1);
      const cx = x(i);
      const mid = (px + cx) / 2;
      return `C${mid},${y(running[i - 1])} ${mid},${y(v)} ${cx},${y(v)}`;
    })
    .join(' ');
  const area = `${line} L${x(points.length - 1)},${H} L${x(0)},${H} Z`;

  /* Ключ для перерисовки: при смене периода данные меняются, но узел
     остаётся тем же, и анимация появления не повторилась бы. */
  const shape = `${points.length}-${total}`;

  const shown = at ?? peakIndex;
  const active = points[shown];
  const empty = max === 0;

  /* Четыре подписи, расставленные ровно по ширине.

     Шагом от начала они ложились неровно: последняя всегда прижата к
     концу шкалы, и если длина не делилась на шаг нацело, предпоследняя
     оказывалась вплотную к ней — «15:00 17:00» слипалось в одно слово
     на телефоне. Доли от общей длины такого не допускают по
     построению. */
  const TICKS = 4;
  const marks = Math.max(1, Math.min(TICKS, points.length));
  const ticks = [
    ...new Set(
      Array.from({ length: marks }, (_, i) =>
        marks === 1 ? 0 : Math.round((i * (points.length - 1)) / (marks - 1)),
      ),
    ),
  ];

  /* Текущий час подписан словом: без него обрыв графика посреди шкалы
     читается как потерянные данные. Час помечен на самой точке, а не
     взят последним — последним может оказаться отрезок с записью из
     будущего по кривым часам телефона. */
  const nowIndex = points.findIndex((p) => p.now);

  function move(to: number) {
    setAt(Math.min(points.length - 1, Math.max(0, to)));
  }

  /* Колонка во всю высоту прибора: поле графика забирает остаток, а
     легенда, ось и подпись остаются своего размера. Иначе растянутая
     панель отдаёт лишнюю высоту полям, и дыра просто переезжает
     внутрь рамки. */
  return (
    <div className="mt-1 flex min-h-0 flex-1 flex-col">
      {/* Легенда — что за линия и что за столбики. Больше в шапке
          графика ничего нет: итог периода стоит на плите наверху
          страницы, и второе такое же число здесь заставляло бы сверять
          два, вместо того чтобы прочитать одно. */}
      <div className="chart-head">
        <div className="chart-legend">
          <span>
            <span className="chart-key chart-key-line" aria-hidden />
            {hy.today.accumulated}
          </span>
          <span>
            <span className="chart-key chart-key-bar" aria-hidden />
            {byHour ? hy.today.inHour : hy.today.inDay}
          </span>
          {events.length > 0 && (
            <span>
              <span className="chart-key chart-key-dot" aria-hidden />
              {unitOne}
            </span>
          )}
        </div>
      </div>

      {/* Поле графика само по себе цель для клавиатуры: стрелками ходят
          по отрезкам, а подпись под ним читается вслух — иначе весь
          рельеф дня достаётся только тем, у кого есть мышь. */}
      <div
        className="chart-plot"
        role="group"
        tabIndex={0}
        aria-label={byHour ? hy.today.flowDay : hy.today.flowPeriod}
        onPointerLeave={() => setAt(null)}
        onBlur={() => setAt(null)}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - box.left) / box.width;
          move(Math.round(ratio * (points.length - 1)));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') move((at ?? peakIndex) + 1);
          else if (e.key === 'ArrowLeft') move((at ?? peakIndex) - 1);
          else if (e.key === 'Home') move(0);
          else if (e.key === 'End') move(points.length - 1);
          else if (e.key === 'Escape') setAt(null);
          else return;
          e.preventDefault();
        }}
      >
        {/* Рельеф. Приглушён до фона: он подложка под линией, а не
            второй график — два одинаково громких слоя спорили бы за
            взгляд, и не читался бы ни один. */}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {points.map((p, i) => (
            <div
              key={`${p.label}-${i}`}
              className="day-bar flex-1 rounded-t-[3px] transition-opacity"
              style={{
                height: `${max > 0 ? Math.max(1.5, (p.value / max) * 74) : 1.5}%`,
                background:
                  i === nowIndex
                    ? 'color-mix(in srgb, var(--board-ink) 22%, transparent)'
                    : 'color-mix(in srgb, var(--board-ink) 13%, transparent)',
                opacity: at === null || at === i ? 1 : 0.45,
                ['--i' as string]: i,
              }}
            />
          ))}
        </div>

        {/* Линия накопления. `preserveAspectRatio` снят, чтобы полотно
            тянулось по ширине блока; толщину штриха при этом держит
            `vector-effect` — иначе на широком экране линия расплывается
            в полосу. */}
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="dayFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-strong)" stopOpacity="0.16" />
              <stop offset="100%" stopColor="var(--accent-strong)" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Три линии сетки. Больше не нужно: точные значения даёт
              подпись, а сетка тут только чтобы глаз держал высоту. */}
          {[0.25, 0.5, 0.75].map((f) => (
            <line
              key={f}
              x1="0"
              x2={W}
              y1={H * f}
              y2={H * f}
              stroke="color-mix(in srgb, var(--board-ink) 8%, transparent)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {!empty && (
            <>
              <path key={`a-${shape}`} className="day-area" d={area} fill="url(#dayFill)" />
              {/* `pathLength` приводит длину к единице: штрих для отрисовки
                  не зависит ни от ширины блока, ни от числа точек. */}
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
            </>
          )}
        </svg>

        {/* Отвес и точка под курсором — блоками, а не в SVG: круг в
            растянутом полотне превратился бы в овал. */}
        {at !== null && points.length > 1 && !empty && (
          <>
            <div
              className="pointer-events-none absolute top-0 bottom-0 w-px"
              style={{
                left: `${(at / (points.length - 1)) * 100}%`,
                background: 'color-mix(in srgb, var(--board-ink) 22%, transparent)',
              }}
            />
            <div
              className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `${(at / (points.length - 1)) * 100}%`,
                top: `${(y(running[at]) / H) * 100}%`,
                background: 'var(--accent-strong)',
                boxShadow: '0 0 0 3px var(--board)',
              }}
            />
          </>
        )}
      </div>

      {/* Полоса времени: настоящие операции, каждая в свою минуту.

          Столбики над ней отвечают «сколько за час», линия — «сколько
          всего», а точки показывают сами машины: их ритм, сгустки и
          паузы. Последняя помечена лаймом — не «сейчас» и не «в
          работе», а просто последняя из записанных.

          Полоса своей высоты и своим блоком, а не внутри поля: точка на
          фоне столбиков теряется, а над ними мешает читать линию. */}
      {events.length > 0 && (
        /* Ловит полоса целиком, а не каждая точка по отдельности.

           Точка — семь пикселей: в час пик их четыре подряд, и попасть
           мышью в нужную нельзя, а пальцем нельзя вовсе. Полоса ловит
           движение по всей своей длине и выбирает ближайшую операцию —
           тот же приём, которым поле графика выбирает час. Клавиатуре
           точки остаются кнопками: по ним ходят табом. */
        <div
          className="chart-strip"
          onPointerLeave={() => setEv(null)}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            const ratio = (e.clientX - box.left) / box.width;
            let best = 0;
            let gap = Infinity;
            events.forEach((x, i) => {
              const d = Math.abs(x.at - ratio);
              if (d < gap) {
                gap = d;
                best = i;
              }
            });
            setEv(best);
          }}
        >
          {events.map((e, i) => (
            <button
              key={e.id}
              type="button"
              className="chart-ev"
              style={{ left: `${e.at * 100}%`, ['--i' as string]: i }}
              data-last={i === events.length - 1 ? '' : undefined}
              data-on={ev === i ? '' : undefined}
              aria-label={`${e.time} · ${e.title} · ${money(e.price)}`}
              onFocus={() => setEv(i)}
              onBlur={() => setEv(null)}
            />
          ))}

          {/* Мини-карточка операции: во сколько, какая машина, что
              делали, сколько взяли и сколько ушло человеку. Настоящие
              поля записи; ничего, чего нет в базе, здесь не появляется.

              Крайние карточки прижаты к краям — центрованная у первой
              точки уезжает половиной за левое поле прибора. */}
          {ev !== null && events[ev] && (
            <div
              className="chart-tip"
              style={
                {
                  left: `${events[ev].at * 100}%`,
                  translate:
                    events[ev].at < 0.2 ? '0' : events[ev].at > 0.8 ? '-100%' : '-50%',
                } as CSSProperties
              }
            >
              <span className="chart-tip-time num">{events[ev].time}</span>
              <span className="chart-tip-key truncate">{events[ev].title}</span>
              {events[ev].note && (
                <span className="chart-tip-note truncate">{events[ev].note}</span>
              )}
              <span className="chart-tip-sum num">{money(events[ev].price)}</span>
              {events[ev].who && (
                <span className="chart-tip-who">
                  <span className="truncate">{events[ev].who}</span>
                  <span className="num">{money(events[ev].share)}</span>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Крайние подписи прижаты к краям, а не отцентрованы по своей
          точке: центрованная первая уезжает половиной за левое поле
          прибора, и «08:00» читается как «:00». */}
      <div className="chart-axis" aria-hidden>
        {ticks.map((i) => (
          <span
            key={`${points[i]?.label}-${i}`}
            className="num"
            style={{
              left: `${points.length > 1 ? (i / (points.length - 1)) * 100 : 50}%`,
              translate: i === 0 ? '0' : i === points.length - 1 ? '-100%' : '-50%',
            }}
          >
            {points[i]?.label}
            {i === nowIndex && <b>{hy.today.nowMark}</b>}
          </span>
        ))}
      </div>

      {/* Подпись под графиком — она же подсказка.

          Всплывающее окно поверх линии закрывало бы её собой на узком
          экране, и палец на телефоне закрывал бы вместе с ним. Строка
          под графиком стоит на месте, ничего не перекрывает и меняется
          на лету: без курсора показывает пик, под курсором — точку.

          Отвечает она теперь событием, а не приростом: «в 11:00 приехали
          две машины, они дали 10 000, к этому часу набралось 15 000».

          Пока курсора нет, показанный отрезок подписан словом «больше
          всего»: без него непонятно, почему выбран именно этот час, и
          строка читается как случайная. */}
      <div className="chart-read" aria-live="polite">
        {empty ? (
          <span style={{ color: 'var(--board-muted)' }}>
            {byHour ? hy.owner.emptyToday : hy.today.noRecords}
          </span>
        ) : (
          <>
            {at === null && (
              <span style={{ color: 'var(--board-muted)' }}>{hy.today.peak}</span>
            )}
            <b className="num">{active.label}</b>
            <span className="num">
              {active.count} {unitOne}
            </span>
            <span className="num">
              {byHour ? hy.today.inHour : hy.today.inDay} {money(active.value)}
            </span>
            <span className="num" style={{ color: 'var(--board-muted)' }}>
              {hy.today.accumulated} {money(running[shown] ?? 0)}
            </span>
            {active.people.length > 0 && (
              <span className="chart-read-who truncate">{active.people.join(', ')}</span>
            )}
          </>
        )}
      </div>
    </div>
  );
}

