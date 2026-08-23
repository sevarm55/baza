import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getPeriodStats, getRevenueSeries, getTenant, startOfDay } from '@/lib/queries';
import { getPeriodCosts, profitOf } from '@/lib/expenses';
import { isMonth, localDate, monthBounds } from '@/lib/history';
import { formatCount, formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { intlLocale } from '@/lib/i18n/format';
import { localizeTenantOrNull, unitCount, unitWord } from '@/lib/i18n/terms';
import { Metric, MetricStrip } from '@/components/patterns/metric';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Календарь месяца.
 *
 * Сетка отвечает на один вопрос: где месяц был густым. Цифры в клетку не
 * влезают, а высота столбика читается мгновенно, поэтому в клетке число
 * дня, столбик выручки и число машин мелким. Точные деньги в карточке
 * дня, туда и ведёт нажатие.
 *
 * Считает всё то же, что и приложение, тем же кодом: `monthBounds`,
 * `getRevenueSeries`, `getPeriodStats`, `getPeriodCosts`, `profitOf`.
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
  /* Без месяца текущий, в зоне бизнеса, а не сервера. Он же предел
     перехода вперёд. */
  const thisMonth = localDate(zone).slice(0, 7);
  const month = isMonth(asked) ? asked : thisMonth;
  const { from, to, days } = monthBounds(month, zone);

  /* Аренда начисляется по прожитые дни включительно, а не за месяц
     вперёд: в середине месяца полная сумма показала бы убыток, которого
     ещё нет. То же правило в `/api/v1/calendar`. */
  const tomorrow = new Date(startOfDay(zone).getTime() + 86_400_000);
  const costsTo = to < tomorrow ? to : tomorrow;

  const [series, stats, costs] = await Promise.all([
    getRevenueSeries(tenant.id, from, zone, 'day', to),
    getPeriodStats(tenant.id, from, to),
    getPeriodCosts(tenant.id, from, costsTo, days),
  ]);

  const money = (n: number) => formatMoney(n, tenant.currency, t.locale);
  const byDay = new Map(series.map((s) => [s.key.slice(0, 10), s]));

  /* Дни месяца по местному календарю. День строкой `YYYY-MM-DD`: в
     адресе он строкой, в ключе ряда строкой, и превращать его
     туда-обратно значит трижды рискнуть часовым поясом. */
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

  /* Пустые клетки перед первым числом: субботы обязаны стоять в одном
     столбце у соседних месяцев. Понедельник первым. Хвост добивается до
     полной недели, чтобы сетка оставалась прямоугольником. */
  const firstWeekday = (new Date(`${month}-01T12:00:00Z`).getUTCDay() + 6) % 7;
  const trailing = (7 - ((firstWeekday + days) % 7)) % 7;

  const monthTitle = new Intl.DateTimeFormat(intlLocale(t.locale), {
    month: 'long',
    year: 'numeric',
    timeZone: zone,
  });
  const title = monthTitle.format(from);

  const weekdays = weekdayNames(t.locale);
  const first = firstMonth(tenant.createdAt, zone);
  const prev = shiftMonth(month, -1);
  const next = shiftMonth(month, +1);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        className="mb-0"
        title={t.calendar.title}
        description={t.calendar.lead}
        actions={
          /* Вперёд дальше текущего месяца не ходим, назад не раньше
             того, в котором завели бизнес: пустые месяцы до его
             появления это не нули мойки, а месяцы, когда мойки не было. */
          <div className="flex items-center gap-1">
            <MonthStep
              href={`/owner/calendar?m=${prev}`}
              enabled={prev >= first}
              back
              label={monthTitle.format(monthBounds(prev, zone).from)}
            />
            <span className="min-w-36 text-center text-sm font-medium">{title}</span>
            <MonthStep
              href={`/owner/calendar?m=${next}`}
              enabled={next <= thisMonth}
              label={monthTitle.format(monthBounds(next, zone).from)}
            />
          </div>
        }
      />

      {/* Итог месяца рядом с сеткой: клетки отвечают «когда густо», а
          «сколько всего» только здесь. */}
      <MetricStrip columns={3}>
        <Metric label={unitWord(stats.count, tenant.unitOne, t.locale)} value={formatCount(stats.count, t.locale)} />
        <Metric label={t.owner.revenue} value={money(stats.revenue)} />
        <Metric
          label={monthProfit >= 0 ? t.owner.profit : t.owner.inTheRed}
          value={money(Math.abs(monthProfit))}
          tone={monthProfit < 0 ? 'destructive' : 'default'}
        />
      </MetricStrip>

      <Panel padded={false} className="overflow-hidden">
        {/* Волосяные линии между клетками рисует зазор сетки на подложке
            цвета границы: так у сетки нет ни двойных линий по краю, ни
            особых правил для последнего столбца. */}
        <div role="grid" aria-label={title} className="grid grid-cols-7 gap-px bg-border">
          {weekdays.map((name) => (
            <div
              key={name}
              role="columnheader"
              className="bg-card px-2 py-2 text-center text-2xs font-medium tracking-wider text-muted-foreground uppercase"
            >
              {name}
            </div>
          ))}

          {Array.from({ length: firstWeekday }, (_, i) => (
            <span key={`lead-${i}`} aria-hidden className="bg-card" />
          ))}

          {cells.map((cell) => {
            const empty = cell.count === 0;
            const isToday = cell.day === today;
            const label = `${cell.number} · ${unitCount(cell.count, tenant.unitOne, t.locale)} · ${money(cell.revenue)}`;
            return (
              <Link
                key={cell.day}
                href={`/owner/day/${cell.day}`}
                aria-label={label}
                title={label}
                className={cn(
                  'flex min-h-20 flex-col justify-between bg-card p-2 outline-none transition-colors hover:bg-muted focus-visible:bg-muted lg:min-h-24',
                  empty && 'text-muted-foreground',
                )}
              >
                <span
                  className={cn(
                    'num inline-flex size-6 items-center justify-center rounded-md text-xs font-medium',
                    isToday && 'bg-primary text-primary-foreground',
                  )}
                >
                  {cell.number}
                </span>

                {/* Столбик, а не число: деньги дня в клетку не влезают, а
                    высоту глаз сравнивает без чтения. Минимум в две точки
                    у непустого дня: нулевой столбик читался бы как «не
                    работали». */}
                {!empty && (
                  <span className="flex h-6 items-end gap-1.5">
                    <span
                      aria-hidden
                      className="w-1 shrink-0 rounded-sm bg-primary"
                      style={{ height: `${Math.max(8, (cell.revenue / peak) * 100)}%` }}
                    />
                    <span className="num text-xs leading-none text-muted-foreground">{cell.count}</span>
                  </span>
                )}
              </Link>
            );
          })}

          {Array.from({ length: trailing }, (_, i) => (
            <span key={`trail-${i}`} aria-hidden className="bg-card" />
          ))}
        </div>
      </Panel>
    </div>
  );
}

/**
 * Шаг по месяцам. Недоступный шаг погашен, а не спрятан: кнопка на
 * месте говорит, что дальше просто нечего смотреть.
 */
function MonthStep({
  href,
  enabled,
  back = false,
  label,
}: {
  href: string;
  enabled: boolean;
  back?: boolean;
  label: string;
}) {
  const Icon = back ? ChevronLeft : ChevronRight;
  if (!enabled) {
    return (
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        aria-disabled
        aria-label={label}
        tabIndex={-1}
        className="pointer-events-none opacity-40"
      >
        <Icon />
      </Button>
    );
  }
  return (
    <Button variant="outline" size="icon-sm" render={<Link href={href} aria-label={label} />}>
      <Icon />
    </Button>
  );
}

function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + by, 1, 12));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Месяц, в котором завели бизнес: раньше него смотреть нечего. */
function firstMonth(createdAt: Date, timezone: string): string {
  return localDate(timezone, createdAt).slice(0, 7);
}

/**
 * Дни недели коротко, на языке того, кто смотрит. Через `Intl`, а не
 * списком в словаре: система знает их для всех локалей сразу. Начало
 * недели понедельник.
 */
function weekdayNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(intlLocale(locale), { weekday: 'short', timeZone: 'UTC' });
  // 5 января 1970 понедельник
  return Array.from({ length: 7 }, (_, i) => f.format(new Date(Date.UTC(1970, 0, 5 + i))));
}
