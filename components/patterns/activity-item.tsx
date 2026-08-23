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
  default: 'bg-muted-foreground/50',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  brand: 'bg-primary',
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
        <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
          <span className="font-medium">{phrase.actor}</span>
          <span className="text-muted-foreground">{phrase.action}</span>
          {phrase.object && <span className="num">{phrase.object}</span>}
        </div>
        {!dense && phrase.note && (
          <div className="mt-0.5 text-xs text-muted-foreground">{phrase.note}</div>
        )}
        {dense && phrase.note && (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">{phrase.note}</div>
        )}
      </div>

      {phrase.amount && (
        <span className="num shrink-0 pt-px text-sm font-medium">{phrase.amount}</span>
      )}
      <time
        dateTime={row.at}
        className="num shrink-0 pt-px text-xs text-muted-foreground"
        title={`${dayMonth(row.at, timezone)} ${hhmm(row.at, timezone)}`}
      >
        {hhmm(row.at, timezone)}
      </time>
    </li>
  );
}
