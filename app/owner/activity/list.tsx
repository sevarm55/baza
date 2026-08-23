'use client';

import { useState, useTransition } from 'react';

import { ActivityItem } from '@/components/patterns/activity-item';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ActivityGroup, ActivityRow } from '@/lib/activity-types';
import { useT } from '@/lib/i18n/client';
import { dayMonth } from '@/lib/time';

/**
 * Лента страницы активности: строки по дням, подгрузка вниз.
 *
 * Дальше первой сотни строки приезжают по запросу `before=…`, то есть
 * по времени последней показанной, а не по номеру страницы: пока
 * человек читает, лента растёт сверху, и нумерация дала бы повтор.
 */
export function ActivityList({
  initial,
  pageSize,
  currency,
  timezone,
  group,
  actor,
  from,
  to,
  filtered,
}: {
  initial: ActivityRow[];
  pageSize: number;
  currency: string;
  timezone: string;
  group: 'all' | ActivityGroup;
  actor: string;
  from: string;
  to?: string;
  /** стоит хоть один фильтр: пустота объясняется им, а не тишиной */
  filtered: boolean;
}) {
  const t = useT();
  const [rows, setRows] = useState(initial);
  const [done, setDone] = useState(initial.length < pageSize);
  const [pending, start] = useTransition();

  const loadMore = () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    start(async () => {
      const q = new URLSearchParams({ before: last.at, from, limit: String(pageSize) });
      if (to) q.set('to', to);
      if (group !== 'all') q.append('group', group);
      if (actor) q.set('actor', actor);
      const res = await fetch(`/owner/activity/feed?${q}`, { cache: 'no-store' });
      if (!res.ok) return;
      const body = (await res.json()) as { rows: ActivityRow[] };
      setRows((prev) => [...prev, ...body.rows.filter((r) => !prev.some((p) => p.id === r.id))]);
      if (body.rows.length < pageSize) setDone(true);
    });
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        title={filtered ? t.activity.emptyFilter : t.activity.empty}
        description={filtered ? undefined : t.activity.emptyNote}
      />
    );
  }

  /* Группировка по дням: заголовок дня один раз, строки под ним. */
  const days: { key: string; label: string; rows: ActivityRow[] }[] = [];
  for (const row of rows) {
    const key = dayMonth(row.at, timezone);
    const bucket = days[days.length - 1];
    if (bucket && bucket.key === key) bucket.rows.push(row);
    else days.push({ key, label: key, rows: [row] });
  }

  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <Panel key={day.key} padded={false} title={day.label} count={day.rows.length}>
          <ul className="divide-y divide-border">
            {day.rows.map((row) => (
              <ActivityItem key={row.id} row={row} currency={currency} timezone={timezone} />
            ))}
          </ul>
        </Panel>
      ))}
      {!done && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={pending}>
            {pending && <Spinner className="size-3.5" data-icon="inline-start" />}
            {t.activity.more}
          </Button>
        </div>
      )}
    </div>
  );
}
