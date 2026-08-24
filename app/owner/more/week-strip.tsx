import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

import { getDict } from '@/lib/i18n/server';
import { intlLocale } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

/**
 * Последняя неделя — семь клеток над картой разделов.
 *
 * Раньше на этом месте стояла карточка с рисунком календаря: она
 * обещала календарь, а показывала картинку календаря. Теперь показывает
 * сам календарь — семь дней, залитых по величине выручки. Глаз
 * сравнивает светлоту без измерения, и форма недели читается раньше,
 * чем прочитано слово.
 *
 * Нажатий два разных, и они не перепутаются: заголовок ведёт в месяц,
 * клетка открывает свой день. Поэтому карточка не одна большая ссылка:
 * внутри ссылки нельзя нажать что-то ещё.
 */
export async function WeekStrip({
  days,
  timezone,
  todayKey,
}: {
  /** последние семь дней по возрастанию: дата и выручка за неё */
  days: { key: string; revenue: number; count: number }[];
  timezone: string;
  todayKey: string;
}) {
  const t = await getDict();

  /* Потолок шкалы — лучший день недели, а не месяца: неделя из
     одинаково бледных клеток не говорит ничего. */
  const peak = Math.max(1, ...days.map((d) => d.revenue));

  const weekday = new Intl.DateTimeFormat(intlLocale(t.locale), {
    weekday: 'short',
    timeZone: timezone,
  });

  return (
    <div className="flex flex-col gap-3 rounded-m-hero border border-m-hair bg-m-surface p-4 md:hidden">
      <Link
        href="/owner/calendar"
        className="m-press flex items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="num text-[11px] leading-none font-black tracking-[0.12em] text-m-muted">
            365
          </span>
          <span className="mt-0.5 truncate text-[24px] leading-tight font-bold text-m-ink">
            {t.calendar.title}
          </span>
        </span>
        <ArrowUpRight aria-hidden className="size-4 shrink-0 text-primary" strokeWidth={2.5} />
      </Link>

      <div className="flex gap-1.5">
        {days.map((day) => {
          const share = Math.min(1, day.revenue / peak);
          /* Та же кривая и тот же приглушённый верх, что на экране
             месяца: клетка остаётся светлой при любой выручке, чтобы
             лучший день не читался ошибкой или выделением. */
          const heat = day.revenue > 0 ? 0.05 + 0.19 * Math.sqrt(share) : 0;
          const isToday = day.key === todayKey;
          const at = new Date(`${day.key}T12:00:00Z`);

          return (
            <Link
              key={day.key}
              href={`/owner/day/${day.key}`}
              className={cn(
                'm-press flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-m-chip py-2',
                'outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
                isToday ? 'ring-[1.2px] ring-m-ink/30' : 'ring-[0.8px] ring-m-hair',
              )}
              style={{ background: `color-mix(in srgb, var(--primary) ${heat * 100}%, transparent)` }}
            >
              <span className="truncate text-[9.5px] leading-none font-semibold text-m-muted">
                {weekday.format(at)}
              </span>
              <span
                className={cn(
                  'num text-[15px] leading-none',
                  day.revenue > 0 ? 'font-bold text-m-ink' : 'font-medium text-m-muted',
                )}
              >
                {Number(day.key.slice(8, 10))}
              </span>
              {/* Сколько машин. Число мельче суммы намеренно: заливка
                  уже сказала про деньги, а это ответ на другой вопрос —
                  много ли было работы. */}
              <span className="num text-[9px] leading-none font-semibold text-m-muted">
                {day.count > 0 ? day.count : ' '}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
