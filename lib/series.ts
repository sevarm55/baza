/** Ключ ряда так, как его строит Postgres: «2026-07-31 16». */
export function keyOf(at: Date, timezone: string, byHour: boolean): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(at);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '00';
  const hour = byHour ? (get('hour') === '24' ? '00' : get('hour')) : '00';
  return `${get('year')}-${get('month')}-${get('day')} ${hour}`;
}

/* Ряд для графика. Живёт здесь, а не в файле маршрута: Next.js
   разрешает в маршруте только имена своего набора, и любой лишний
   экспорт валит проверку типов. А проверять эту функцию надо — она
   решает, увидит ли владелец простой в середине дня. */

/**
 * Дополнить ряд пустыми промежутками.
 *
 * Postgres возвращает только те часы, в которые что-то было. На графике
 * они вставали вплотную, и пятичасовой простой между 11 и 16 исчезал —
 * день выглядел сплошь загруженным. Пустой столбик — тоже факт, и
 * зачастую более важный, чем полный.
 *
 * Для дня начинаем с первого часа, когда появилась первая машина: сутки
 * с полуночи — это шестнадцать пустых столбиков перед единственным
 * полным, и рельеф в них теряется.
 */
export function padSeries(
  points: { key: string; revenue: number; count: number }[],
  byHour: boolean,
  timezone: string,
  from: Date,
  to: Date,
  /* Момент «сейчас» параметром, а не через Date.now() внутри: иначе
     проверить эту функцию можно только в удачный час. Проверка, которая
     зависит от того, когда её запустили, однажды покраснеет ночью и
     научит не верить всему набору. */
  now: Date = new Date(),
) {
  if (points.length === 0) return points;

  const known = new Map(points.map((p) => [p.key, p]));
  const step = byHour ? 3_600_000 : 86_400_000;
  const last = Math.min(to.getTime(), now.getTime());

  /* Идём по моментам времени и переводим каждый в местный ключ — так же,
     как это делает Postgres. Разбирать готовый ключ обратно нельзя: он
     местный, и превращение его в момент времени сдвигает всё на часовой
     пояс. */
  const out: typeof points = [];
  for (let t = from.getTime(); t <= last && out.length < 400; t += step) {
    const key = keyOf(new Date(t), timezone, byHour);
    out.push(known.get(key) ?? { key, revenue: 0, count: 0 });
  }

  /* У дня срезаем пустое начало: сутки с полуночи — это шестнадцать
     пустых столбиков перед первой машиной, и рельеф в них теряется.
     Пустоту ВНУТРИ дня оставляем — она и есть простой. */
  if (!byHour) return out;
  const firstWorked = out.findIndex((p) => p.revenue > 0);
  return firstWorked <= 0 ? out : out.slice(firstWorked);
}
