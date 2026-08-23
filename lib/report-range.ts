import { daysInMonthOf, noonOf, startOfDay, startOfDaysAgo, startOfMonth, startOfPrevMonth } from './time';

/**
 * Отрезок отчёта и его база сравнения.
 *
 * Без обращения к базе: этим пользуются и страница, и панель
 * инструментов в браузере. Правило базы одно на все отрезки и то же,
 * что у сводки (`windowFor`): сравнивать прожитое с прожитым. Половина
 * августа сравнивается с половиной июля, а не с целым июлем; сегодня с
 * тем же днём неделю назад, а не со вчера: у мойки неделя имеет рельеф,
 * и суббота против пятницы не говорит ничего.
 */
export const RANGE_KEYS = ['today', 'week', 'month', 'prevmonth', 'custom'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export type ReportRange = {
  key: RangeKey;
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** точки графика по часам (один день) или по дням */
  byHour: boolean;
  /** число дней в отрезке */
  days: number;
  /** знаменатель доли постоянных расходов: дней в месяце начала */
  spread: number;
  /** `YYYY-MM-DD` границ для адреса и выгрузки */
  fromDay: string;
  toDay: string;
};

const DAY = 86_400_000;

/** Настоящая ли это дата `YYYY-MM-DD`: «9999-99-99» под шаблон подходит. */
function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const back = new Date(Date.UTC(y, m - 1, d, 12));
  return back.getUTCFullYear() === y && back.getUTCMonth() === m - 1 && back.getUTCDate() === d;
}

function ymdIn(timezone: string, at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

function daysBetween(from: Date, to: Date): number {
  return Math.max(1, Math.round((to.getTime() - from.getTime()) / DAY));
}

export function asRangeKey(raw: string | undefined | null): RangeKey {
  return (RANGE_KEYS as readonly string[]).includes(raw ?? '') ? (raw as RangeKey) : 'month';
}

/** Отрезок по ключу; для `custom` нужны обе даты, иначе откат на месяц. */
export function rangeFor(
  key: RangeKey,
  timezone: string,
  custom?: { from?: string | null; to?: string | null },
  now = new Date(),
): ReportRange {
  const today = startOfDay(timezone, now);
  const tomorrow = new Date(today.getTime() + DAY);

  if (key === 'today') {
    const prevFrom = new Date(today.getTime() - 7 * DAY);
    return {
      key,
      from: today,
      to: tomorrow,
      prevFrom,
      prevTo: new Date(prevFrom.getTime() + DAY),
      byHour: true,
      days: 1,
      spread: daysInMonthOf(timezone, today),
      fromDay: ymdIn(timezone, today),
      toDay: ymdIn(timezone, today),
    };
  }

  if (key === 'week') {
    const from = startOfDaysAgo(timezone, 6);
    const prevFrom = new Date(from.getTime() - 7 * DAY);
    return {
      key,
      from,
      to: tomorrow,
      prevFrom,
      prevTo: from,
      byHour: false,
      days: 7,
      spread: daysInMonthOf(timezone, from),
      fromDay: ymdIn(timezone, from),
      toDay: ymdIn(timezone, today),
    };
  }

  if (key === 'prevmonth') {
    const from = startOfPrevMonth(timezone, now);
    const to = startOfMonth(timezone, now);
    const prevFrom = startOfMonth(timezone, new Date(from.getTime() - DAY));
    return {
      key,
      from,
      to,
      prevFrom,
      prevTo: from,
      byHour: false,
      days: daysBetween(from, to),
      spread: daysInMonthOf(timezone, from),
      fromDay: ymdIn(timezone, from),
      toDay: ymdIn(timezone, new Date(to.getTime() - DAY)),
    };
  }

  if (key === 'custom' && custom?.from && custom.to && isDate(custom.from) && isDate(custom.to)) {
    let a = startOfDay(timezone, noonOf(timezone, custom.from));
    let b = startOfDay(timezone, noonOf(timezone, custom.to));
    if (b < a) [a, b] = [b, a];
    /* Дальше сегодняшнего дня не смотрим: будущих машин не бывает. */
    if (b > today) b = today;
    if (a > today) a = today;
    const to = new Date(b.getTime() + DAY);
    const days = daysBetween(a, to);
    const prevFrom = new Date(a.getTime() - days * DAY);
    return {
      key,
      from: a,
      to,
      prevFrom,
      prevTo: a,
      byHour: days === 1,
      days,
      spread: daysInMonthOf(timezone, a),
      fromDay: ymdIn(timezone, a),
      toDay: ymdIn(timezone, b),
    };
  }

  /* Месяц: по умолчанию и как откат для кривого custom. */
  const from = startOfMonth(timezone, now);
  const prevFrom = startOfPrevMonth(timezone, now);
  const lived = Math.min(prevFrom.getTime() + (now.getTime() - from.getTime()), from.getTime());
  return {
    key: 'month',
    from,
    to: tomorrow,
    prevFrom,
    prevTo: new Date(lived),
    byHour: false,
    days: daysBetween(from, tomorrow),
    spread: daysInMonthOf(timezone, from),
    fromDay: ymdIn(timezone, from),
    toDay: ymdIn(timezone, today),
  };
}
