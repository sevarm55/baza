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
 * Сколько полных суток прошло с момента.
 *
 * Живёт здесь по той же причине, что и `startOfDaysAgo`: `Date.now()` в
 * теле серверного компонента — обращение к изменчивому во время
 * отрисовки, и правило чистоты React справедливо на него ругается.
 *
 * Сутки календарные не считаем: «прошло семь дней с последней выплаты» —
 * это про срок, а не про границу суток, и переход через полночь не
 * должен превращать шесть дней в семь.
 */
export function daysSince(at: Date): number {
  return Math.floor((Date.now() - at.getTime()) / 86_400_000);
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

/**
 * Полдень указанного дня в часовом поясе бизнеса.
 *
 * Нужно там, где день приходит из поля ввода строкой `2026-08-12`, а
 * лечь в базу обязан моментом. Полдень, а не полночь: граница суток —
 * единственное место, где ошибка в час уводит запись во вчерашний день,
 * а середина дня остаётся серединой дня при любой погрешности.
 *
 * Считается дважды по той же причине, что и `startOfDay`: смещение зоны
 * в полдень выбранного дня может отличаться от смещения сейчас — ровно
 * на час в сутки перевода стрелок.
 */
export function noonOf(timezone: string, day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  const utcNoon = Date.UTC(y, m - 1, d, 12);
  const probe = new Date(utcNoon - zoneOffset(timezone, new Date(utcNoon)));
  return new Date(utcNoon - zoneOffset(timezone, probe));
}

/**
 * День из поля ввода — моментом, и не из будущего.
 *
 * Поле даёт `2026-08-12`; в базе лежит момент, и собрать его надо в
 * поясе бизнеса, иначе вечерняя трата уедет во вчера. Будущее
 * отбрасывается молча: расход, которого ещё не было, ломает и прибыль
 * периода, и порядок списка.
 *
 * Живёт здесь, а не рядом с формой, потому что дату присылают двое —
 * браузер серверным действием и телефон запросом к API. Два разбора
 * одной строки расходятся на первой же правке: в одном месте будущее
 * отбросили, в другом забыли.
 */
export function pastDay(raw: string | undefined | null, timezone: string): Date | null {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const at = noonOf(timezone, raw);
  return at.getTime() > Date.now() ? null : at;
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

/**
 * «20:17» в часовом поясе бизнеса.
 *
 * Единственный способ показать время записи. `getHours()` брать нельзя ни
 * на сервере, ни в браузере, и это не придирка — так уже сломалось:
 *
 * Кабинет владельца — серверный компонент, и `getHours()` там читал зону
 * контейнера, то есть UTC: запись, сделанная в 00:17 по Еревану,
 * показывалась как 20:17 накануне. Экран мойщика — клиентский, его HTML
 * сначала собирается на сервере (те же 20:17), а после гидратации
 * пересчитывается в зоне БРАУЗЕРА (00:17). Отсюда и мигание при
 * обновлении страницы, и расхождение двух экранов на одной и той же
 * записи.
 *
 * Зона бизнеса чинит оба случая разом: она одинакова на сервере, в
 * браузере и в приложении, поэтому мигать больше нечему. Она же и
 * единственно верная по смыслу — сутки мойки считаются по её часам, а не
 * по часам того, кто на неё смотрит. Владелец в поездке видит смену
 * своей мойки, а не своего часового пояса.
 *
 * Час двузначный и через h23: с `hour12: false` часть локалей отдаёт
 * полночь как «24:17».
 */
export function hhmm(at: Date | string | number, timezone: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at instanceof Date ? at : new Date(at));
}

/**
 * «12.08» в часовом поясе бизнеса.
 *
 * Раньше день брали через `getDate()` с припиской «без локали: Intl
 * расходится между сервером и браузером». Расхождение было настоящим, но
 * лечили не то: `getDate()` тоже читает зону того, кто считает, — просто
 * молча. Ночная запись у ереванской мойки уезжала во вчерашний день.
 * Явная зона в Intl чинит и локаль, и зону разом: сервер, браузер и
 * приложение получают одну строку.
 */
export function dayMonth(at: Date | string | number, timezone: string): string {
  const iso = ymd(at, timezone);
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

/** «2026-08-11» в часовом поясе бизнеса. Тот же разбор, что и у времени. */
export function ymd(at: Date | string | number, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at instanceof Date ? at : new Date(at));
}
