/**
 * Время в часовом поясе бизнеса.
 *
 * Отдельный модуль без единого импорта базы — намеренно. Границы периодов
 * нужны и серверу, и вкладкам в браузере; когда они лежали рядом с
 * запросами, клиентский компонент через одну ссылку утаскивал в бандл
 * драйвер Postgres, и сборка падала на `perf_hooks`.
 */

/** Начало «сегодня» в часовом поясе бизнеса, а не сервера. */
function zoneParts(timezone: string, at: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') === 24 ? 0 : get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * На сколько зона отстоит от UTC в этот конкретный момент.
 *
 * Момент округляем до секунды: разложение по зоне секундами и
 * ограничивается, и без этого миллисекунды входного времени утекали в
 * смещение, а оттуда — в границу суток. «Начало дня» получалось не
 * полночью, а полночью плюс случайный остаток, и запись, сделанная в
 * первую долю секунды после неё, в этот день не попадала.
 */
function zoneOffset(timezone: string, at: Date): number {
  const p = zoneParts(timezone, at);
  const whole = at.getTime() - at.getMilliseconds();
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - whole;
}

export function startOfDay(timezone: string, at = new Date()): Date {
  const p = zoneParts(timezone, at);
  const midnight = Date.UTC(p.year, p.month - 1, p.day);

  /* Считаем дважды. Смещение зоны в полночь может отличаться от смещения
     в момент `at` — ровно на час в день перевода стрелок. По одному
     измерению сутки перехода получались длиной 24 часа вместо 23, и
     граница дня уезжала. Второй проход берёт смещение уже у самой
     полуночи. В Ереване стрелки не переводят, и обе итерации совпадают. */
  const first = new Date(midnight - zoneOffset(timezone, at));
  return new Date(midnight - zoneOffset(timezone, first));
}

/**
 * Начало дня, который был N дней назад, в часовом поясе бизнеса.
 *
 * Живёт здесь, а не в странице, намеренно: `Date.now()` в теле серверного
 * компонента — обращение к изменчивому во время рендера, и правило чистоты
 * React справедливо на него ругается.
 */
export function startOfDaysAgo(timezone: string, days: number): Date {
  return startOfDay(timezone, new Date(Date.now() - days * 86_400_000));
}

/**
 * Начало календарного месяца в часовом поясе бизнеса.
 *
 * Владелец живёт месяцами, а не «последними тридцатью днями»: аренда
 * месячная, зарплаты месячные, налоги месячные. «Тридцать дней» — период
 * аналитика; на вопрос «сколько я заработал в этом месяце» он не отвечает.
 */
export function startOfMonth(timezone: string, at = new Date()): Date {
  const p = zoneParts(timezone, at);
  const first = Date.UTC(p.year, p.month - 1, 1);
  const probe = new Date(first - zoneOffset(timezone, at));
  return new Date(first - zoneOffset(timezone, probe));
}

/** Начало месяца, предыдущего тому, в который попадает `at`. */
export function startOfPrevMonth(timezone: string, at = new Date()): Date {
  const thisMonth = startOfMonth(timezone, at);
  // на сутки назад от первого числа — это всегда прошлый месяц, какой бы
  // длины он ни был
  return startOfMonth(timezone, new Date(thisMonth.getTime() - 86_400_000));
}

/** Сколько суток в календарном месяце, в который попадает `at`. */
export function daysInMonthOf(timezone: string, at: Date): number {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).format(at);
  const [y, m] = p.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
