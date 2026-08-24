'use client';

import { Cog } from 'lucide-react';

import { PersonAvatar } from '@/components/patterns/person';
import type { ActivityRow } from '@/lib/activity-types';
import { activityPhrase } from '@/lib/activity-text';
import { useT } from '@/lib/i18n/client';
import { formatMoney } from '@/lib/money';
import { dayMonth, hhmm } from '@/lib/time';
import { cn } from '@/lib/utils';

const TONE_DOT: Record<ReturnType<typeof activityPhrase>['tone'], string> = {
  default: 'bg-muted-foreground/50 max-md:bg-m-faint',
  success: 'bg-success max-md:bg-m-lime',
  warning: 'bg-warning max-md:bg-m-warn',
  danger: 'bg-destructive max-md:bg-m-bad',
  brand: 'bg-primary max-md:bg-m-grape',
};

/**
 * Строка ленты: кто, что, с чем, сколько, когда.
 *
 * Одна строка на событие, без карточек: лента читается сверху вниз
 * как журнал. Имя жирным, событие тихим, объект обычным, сумма своим
 * столбцом табличными цифрами, время справа. Цвет точки у аватара
 * называет знак события: зелёный появился, красный исчез, янтарный
 * деньги ушли, грейп записали.
 */
export function ActivityItem({
  row,
  currency,
  timezone,
  dense = false,
  fresh = false,
  className,
}: {
  row: ActivityRow;
  currency: string;
  timezone: string;
  /** в панели на сводке: без уточнений второй строкой */
  dense?: boolean;
  /** только что приехало: подсветка на секунду */
  fresh?: boolean;
  className?: string;
}) {
  const t = useT();
  const phrase = activityPhrase(row, t, (n) => formatMoney(n, currency, t.locale));
  const system = row.actorRole === 'system';

  return (
    <li
      data-fresh={fresh || undefined}
      className={cn(
        'flex items-start gap-2.5 px-4 py-2 transition-colors data-fresh:bg-primary-soft/60',
        /* На телефоне строка живёт на белом листе и дышит: сорок восемь
           точек в высоту, поле как у остальных строк системы. */
        'max-md:gap-3 max-md:px-4 max-md:py-3 max-md:data-fresh:bg-m-lime/25',
        className,
      )}
    >
      <span className="relative mt-0.5 shrink-0">
        {system ? (
          <span className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Cog className="size-3.5" aria-hidden />
          </span>
        ) : (
          <PersonAvatar name={row.actorName} size="sm" />
        )}
        <span
          aria-hidden
          className={cn(
            'absolute -right-0.5 -bottom-0.5 size-2 rounded-full ring-2 ring-card',
            TONE_DOT[phrase.tone],
          )}
        />
      </span>

      <div className="min-w-0 flex-1 leading-tight">
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm max-md:text-[15px]">
          <span className="font-medium max-md:font-semibold max-md:text-m-ink">{phrase.actor}</span>
          <span className="text-muted-foreground max-md:text-m-muted">{phrase.action}</span>
          {phrase.object && <span className="num max-md:text-m-ink">{phrase.object}</span>}
        </div>
        {!dense && phrase.note && (
          <div className="mt-0.5 text-xs text-muted-foreground max-md:text-[12.5px] max-md:text-m-muted">
            {phrase.note}
          </div>
        )}
        {dense && phrase.note && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground max-md:text-[12.5px] max-md:text-m-muted">
            {phrase.note}
          </div>
        )}
      </div>

      {phrase.amount && (
        <span className="num shrink-0 pt-px text-sm font-medium max-md:text-[15px] max-md:font-bold max-md:text-m-ink">
          {phrase.amount}
        </span>
      )}
      <time
        dateTime={row.at}
        className="num shrink-0 pt-px text-xs text-muted-foreground max-md:text-[12px] max-md:text-m-faint"
        title={`${dayMonth(row.at, timezone)} ${hhmm(row.at, timezone)}`}
      >
        {hhmm(row.at, timezone)}
      </time>
    </li>
  );
}
