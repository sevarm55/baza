import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getPeriodStats, getRevenueSeries, getTenant, startOfDay } from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { isMonth, localDate, monthBounds } from '@/lib/history';
import { formatMoney } from '@/lib/money';
import { Panel, signColor, signOf } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { getDict } from '@/lib/i18n/server';
import { intlLocale } from '@/lib/i18n/format';
import { localizeTenantOrNull, unitCount } from '@/lib/i18n/terms';

/**
 * Календарь месяца.
 *
 * ЗАЧЕМ ОН НУЖЕН. Кабинет отвечал «сколько сегодня» и «сколько за месяц»,
 * а вопрос «что было в прошлую субботу» задают постоянно — и ответить на
 * него было нечем. В приложении календарь есть с самого начала, маршруты
 * `/api/v1/calendar` и `/api/v1/day` написаны для него; в браузере до
 * сих пор не было ни того ни другого.
 *
 * Сетка отвечает на один вопрос: где месяц был густым. Цифры в клетку не
 * влезают, а высота столбика читается мгновенно, поэтому в клетке число
 * дня, полоса выручки и число машин мелким. Точные деньги — в карточке
 * дня, туда и ведёт нажатие.
 *
 * Считает всё то же, что и приложение, тем же кодом: `monthBounds`,
 * `getRevenueSeries`, `getPeriodStats`, `getPeriodCosts`, `profitOf`.
 * Календарь, расходящийся со сводкой хотя бы на драм, не читают вовсе.
 */
export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const tenant = localizeTenantOrNull(await getTenant(session.tid), t.locale);
  if (!tenant) redirect('/session-ended');

  const zone = tenant.timezone;
  const asked = (await searchParams).m ?? '';
  // без месяца — текущий, в зоне бизнеса, а не сервера
  const month = isMonth(asked) ? asked : localDate(zone).slice(0, 7);
  const { from, to, days } = monthBounds(month, zone);

  /* Аренда начисляется по прожитые дни включительно, а не за месяц
     вперёд: в середине месяца полная сумма показала бы убыток, которого
     ещё нет. Прошедшие месяцы это не трогает — там граница уже позади.
     То же правило в `/api/v1/calendar`. */
  const tomorrow = new Date(startOfDay(zone).getTime() + 86_400_000);
  const costsTo = to < tomorrow ? to : tomorrow;

  const [series, stats, costs] = await Promise.all([
    getRevenueSeries(tenant.id, from, zone, 'day', to),
    getPeriodStats(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, costsTo, days),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const byDay = new Map(series.map((s) => [s.key.slice(0, 10), s]));

  /* Дни месяца по местному календарю. День строкой `YYYY-MM-DD`, а не
     объектом Date: в адресе он строкой, в ключе ряда строкой, и
     превращать его туда-обратно значит трижды рискнуть часовым поясом. */
  const cells = Array.from({ length: days }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    const found = byDay.get(day);
    return {
      day,
      number: i + 1,
      revenue: found?.revenue ?? 0,
      count: found?.count ?? 0,
    };
  });

  const monthProfit = profitOf(stats.revenue, stats.payroll, costs);

  const peak = Math.max(1, ...cells.map((c) => c.revenue));
  const today = localDate(zone);

  /* Пустые клетки перед первым числом: сетка обязана начинаться с того
     дня недели, на который месяц пришёлся, иначе субботы окажутся в
     разных столбцах у соседних месяцев. Понедельник первым — так
     считают неделю и в Армении, и в России. */
  const firstWeekday = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;

  const title = new Intl.DateTimeFormat(intlLocale(t.locale), {
    month: 'long',
    year: 'numeric',
    timeZone: zone,
  }).format(from);

  const weekdays = weekdayNames(t.locale);

  return (
    <>
      <PageHead title={t.calendar.title} meta={t.calendar.lead}>
        <MonthNav month={month} label={title} first={firstMonth(tenant.createdAt, zone)} />
      </PageHead>

      {/* Итог месяца рядом с сеткой: цифры в клетках отвечают «когда
          густо», а «сколько всего» — только здесь. */}
      <p className="quick">
        {unitCount(stats.count, tenant.unitOne, t.locale)}
        <i />
        {t.owner.revenue} <b className="num">{money(stats.revenue)}</b>
        <i />
        {t.owner.profit}{' '}
        <b className="num" style={{ color: signColor(signOf(monthProfit)) }}>
          {money(monthProfit)}
        </b>
      </p>

      <div className="mt-[var(--seam)]">
        <Panel>
          <div className="cal-grid" role="grid" aria-label={title}>
            {weekdays.map((name) => (
              <div key={name} className="cal-weekday" role="columnheader">
                {name}
              </div>
            ))}

            {Array.from({ length: firstWeekday }, (_, i) => (
              <span key={`gap-${i}`} aria-hidden />
            ))}

            {cells.map((cell) => (
              <Link
                key={cell.day}
                href={`/owner/day/${cell.day}`}
                className="cal-day"
                data-today={cell.day === today ? '' : undefined}
                data-empty={cell.count === 0 ? '' : undefined}
                aria-label={`${cell.number} · ${unitCount(cell.count, tenant.unitOne, t.locale)} · ${money(cell.revenue)}`}
              >
                <span className="num cal-num">{cell.number}</span>

                {/* Полоса, а не число: деньги дня в клетку не влезают, а
                    высоту глаз сравнивает без чтения. Минимум в две
                    точки у непустого дня — нулевая полоса читалась бы
                    как «не работали». */}
                <span
                  className="cal-bar"
                  style={{
                    height: cell.revenue > 0 ? `${Math.max(2, (cell.revenue / peak) * 100)}%` : 0,
                  }}
                  aria-hidden
                />

                {cell.count > 0 && <span className="num cal-count">{cell.count}</span>}
              </Link>
            ))}
          </div>
        </Panel>
      </div>
    </>
  );
}

/**
 * Переход по месяцам.
 *
 * Вперёд дальше текущего месяца не ходим, назад — не раньше того, в
 * котором завели бизнес: пустые месяцы до его появления это не нули
 * мойки, а месяцы, когда мойки не было.
 */
function MonthNav({ month, label, first }: { month: string; label: string; first: string }) {
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, +1);
  const canPrev = prev >= first;
  const canNext = next <= month.slice(0, 7) || next <= todayMonth();

  return (
    <div className="flex items-center gap-1.5">
      <MonthStep href={`/owner/calendar?m=${prev}`} enabled={canPrev} back />
      <span className="min-w-[8.5rem] text-center text-[14px] font-semibold">{label}</span>
      <MonthStep href={`/owner/calendar?m=${next}`} enabled={canNext} />
    </div>
  );
}

function MonthStep({
  href,
  enabled,
  back = false,
}: {
  href: string;
  enabled: boolean;
  back?: boolean;
}) {
  const Icon = back ? ChevronLeft : ChevronRight;
  /* Недоступный шаг — не ссылка вовсе, а погашенный знак: ссылка,
     которая никуда не ведёт, обещает месяц, которого нет. */
  if (!enabled) {
    return (
      <span className="btn-inline" style={{ opacity: 0.35 }} aria-hidden>
        <Icon className="size-4" />
      </span>
    );
  }
  return (
    <Link className="btn-inline" href={href}>
      <Icon className="size-4" aria-hidden />
    </Link>
  );
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + by, 1, 12));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

function todayMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Месяц, в котором завели бизнес: раньше него смотреть нечего. */
function firstMonth(createdAt: Date, timezone: string): string {
  return localDate(timezone, createdAt).slice(0, 7);
}

/**
 * Дни недели одной буквой, на языке того, кто смотрит.
 *
 * Считаем через `Intl`, а не списком в словаре: три списка по семь слов
 * пришлось бы держать в трёх файлах, а система знает их для всех локалей
 * сразу. Начало недели — понедельник.
 */
function weekdayNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
  // 4 января 1970 — воскресенье; понедельник это +1
  return Array.from({ length: 7 }, (_, i) =>
    f.format(new Date(Date.UTC(1970, 0, 5 + i))),
  );
}
