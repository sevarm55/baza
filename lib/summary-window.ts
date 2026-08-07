import { daysInMonthOf, startOfDay, startOfMonth, startOfPrevMonth } from './time';
/* Только тип: значение отсюда утащило бы в браузерный бандл всю
   базу — `expenses` импортирует драйвер. */
import type { CostSpread } from './expenses';

/**
 * Границы периода и того, с чем его сравнивают.
 *
 * Живёт отдельно от маршрута, потому что этими же границами пользуется
 * веб-кабинет. Разъехавшиеся границы означали бы, что приложение и сайт
 * показывают владельцу разные деньги за один и тот же день.
 *
 * Периоды календарные. «Тридцать дней» и «семь дней» убраны: владелец
 * живёт закрытыми месяцами, потому что месячные у него аренда, зарплаты и
 * налоги, а скользящее окно заставляет его считать в уме, сколько дней
 * месяца уже прошло. Из пяти изученных продуктов скользящие окна остались
 * только у одного.
 */
export const PERIOD_KEYS = ['today', 'month', 'prevmonth'] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export function asPeriod(raw: string | undefined | null): PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(raw ?? '')
    ? (raw as PeriodKey)
    : 'today';
}

export type Window = {
  period: PeriodKey;
  /** график по часам или по дням */
  byHour: boolean;
  from: Date;
  to: Date;
  /** начало отрезка, с которым сравниваем */
  prevFrom: Date;
  /** конец этого отрезка: ровно столько же прожитого времени */
  prevTo: Date;
  /** знаменатель для постоянных расходов: длина месяца этого периода */
  spread: CostSpread;
  /**
   * Сколько дней периода уже прожито — столько столбиков рисует график.
   *
   * Считается здесь, а не в разметке: `Date.now()` в теле серверного
   * компонента — чтение изменчивого во время отрисовки, и правило чистоты
   * React справедливо на него ругается.
   */
  days: number;
};

const DAY = 86_400_000;

/** Сколько целых суток в отрезке, минимум одни. */
function daysIn(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
}

/**
 * С чем сравнивается каждый период.
 *
 * «Сегодня» — с тем же днём НЕДЕЛИ неделю назад, а не со вчера. У мойки
 * главные колебания недельные: суббота против пятницы даёт разницу в разы,
 * и она сообщает про календарь, а не про дела. Так сравнивают Lightspeed,
 * Toast и Square; со вчерашним днём сравнивает Shopify, но там магазин без
 * недельного рельефа.
 *
 * «Этот месяц» — с прошлым месяцем по то же число и час. «Прошлый месяц» —
 * с позапрошлым целиком: оба отрезка закрыты, и это единственное место, где
 * сравнение полностью честное.
 *
 * Верхняя граница базы всегда режется по прожитому времени. Без этого
 * половина сегодняшнего дня сравнивалась с целыми сутками и в обед всегда
 * выходило «минус девяносто процентов» — число про то, который час.
 */
export function windowFor(period: PeriodKey, timezone: string, now = new Date()): Window {
  const today = startOfDay(timezone, now);
  const tomorrow = new Date(today.getTime() + DAY);

  if (period === 'prevmonth') {
    const from = startOfPrevMonth(timezone, now);
    const to = startOfMonth(timezone, now);
    /* Позапрошлый месяц целиком: от его начала до начала прошлого.

       Именно `startOfMonth` от дня накануне, а не `startOfPrevMonth`:
       второе отсчитывает ещё на месяц назад и растягивает базу на два
       месяца. Сравнение июля выходило против мая с июнем сразу. */
    const prevFrom = startOfMonth(timezone, new Date(from.getTime() - DAY));
    return { period, byHour: false, from, to, prevFrom, prevTo: from, spread: daysInMonthOf(timezone, from), days: daysIn(from, to) };
  }

  if (period === 'month') {
    const from = startOfMonth(timezone, now);
    const prevFrom = startOfPrevMonth(timezone, now);
    /* Прожитое время, но не дальше конца прошлого месяца: тридцать первое
       число в паре с месяцем из тридцати дней иначе залезло бы в текущий
       и посчитало его дважды. */
    const prevTo = new Date(
      Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime()),
    );
    return { period, byHour: false, from, to: tomorrow, prevFrom, prevTo, spread: daysInMonthOf(timezone, from), days: daysIn(from, tomorrow) };
  }

  const prevFrom = new Date(today.getTime() - 7 * DAY);
  return {
    period,
    byHour: true,
    from: today,
    to: tomorrow,
    prevFrom,
    prevTo: new Date(prevFrom.getTime() + (now.getTime() - today.getTime())),
    spread: daysInMonthOf(timezone, today),
    days: 1,
  };
}
