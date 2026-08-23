'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { ActivityItem } from '@/components/patterns/activity-item';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { GROUP_OF, type ActivityRow } from '@/lib/activity-types';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/** Сколько строк держит панель на сводке. */
const SHOWN = 8;
/** Через сколько перечитывать страницу после события с деньгами. */
const REFRESH_DEBOUNCE_MS = 2_500;
/** Опрос, когда поток недоступен. */
const POLL_MS = 15_000;

/**
 * Живая лента на «Сегодня».
 *
 * Сначала строки приезжают с сервера вместе со страницей, дальше панель
 * держит поток событий (SSE) и дописывает новые сверху. Если поток не
 * открывается (прокси, старый браузер), панель переходит на опрос раз в
 * пятнадцать секунд: хуже, но честно. В скрытой вкладке ничего не
 * слушает и не опрашивает.
 *
 * Событие с деньгами (машина, расход, смена) перечитывает страницу
 * целиком: показания наверху обязаны измениться вместе с лентой, иначе
 * «новая машина · 5 000 ֏» стоит под выручкой, в которой её ещё нет.
 */
export function LiveActivity({
  initial,
  currency,
  timezone,
  className,
}: {
  initial: ActivityRow[];
  currency: string;
  timezone: string;
  className?: string;
}) {
  const t = useT();
  const router = useRouter();
  const [rows, setRows] = useState<ActivityRow[]>(initial);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const [mode, setMode] = useState<'live' | 'poll' | 'paused'>('live');
  const newest = useRef<string>(initial[0]?.at ?? new Date().toISOString());
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Сервер мог перерисовать страницу с новыми строками (после
     `router.refresh`): берём их как основу, не теряя того, что поток
     успел дослать раньше. */
  useEffect(() => {
    setRows((prev) => merge(initial, prev));
    if (initial[0] && initial[0].at > newest.current) newest.current = initial[0].at;
  }, [initial]);

  useEffect(() => {
    let source: EventSource | null = null;
    let poll: ReturnType<typeof setInterval> | null = null;
    let failures = 0;
    let stopped = false;

    const absorb = (incoming: ActivityRow[]) => {
      if (incoming.length === 0) return;
      setRows((prev) => merge(incoming, prev));
      if (incoming[0].at > newest.current) newest.current = incoming[0].at;

      const ids = new Set(incoming.map((r) => r.id));
      setFresh(ids);
      setTimeout(() => setFresh(new Set()), 1_800);

      const moneyMoved = incoming.some((r) => {
        const g = GROUP_OF[r.type];
        return g === 'cars' || g === 'money' || g === 'shifts';
      });
      if (moneyMoved) {
        if (refreshTimer.current) clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => router.refresh(), REFRESH_DEBOUNCE_MS);
      }
    };

    const fetchNew = async () => {
      try {
        const res = await fetch(`/owner/activity/feed?after=${encodeURIComponent(newest.current)}`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const body = (await res.json()) as { rows: ActivityRow[] };
        absorb(body.rows);
      } catch {
        /* сеть моргнула: следующий опрос */
      }
    };

    const startPoll = () => {
      if (poll) return;
      setMode('poll');
      poll = setInterval(fetchNew, POLL_MS);
    };

    const startStream = () => {
      if (stopped || typeof EventSource === 'undefined') {
        startPoll();
        return;
      }
      source = new EventSource(`/owner/activity/stream?after=${encodeURIComponent(newest.current)}`);
      source.addEventListener('activity', (e) => {
        failures = 0;
        try {
          absorb(JSON.parse((e as MessageEvent).data) as ActivityRow[]);
        } catch {
          /* битый кадр: пропускаем */
        }
      });
      source.onopen = () => {
        failures = 0;
        setMode('live');
      };
      source.onerror = () => {
        /* Поток закрывается сам раз в несколько минут, и браузер
           переподключает его: это не сбой. Сбой это несколько подряд. */
        failures += 1;
        if (failures >= 3 && source) {
          source.close();
          source = null;
          startPoll();
        }
      };
    };

    const stop = () => {
      source?.close();
      source = null;
      if (poll) clearInterval(poll);
      poll = null;
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        stop();
        setMode('paused');
      } else {
        /* Вернулись во вкладку: догнать пропущенное и снова слушать. */
        void fetchNew();
        startStream();
      }
    };

    startStream();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stopped = true;
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, [router]);

  const shown = rows.slice(0, SHOWN);

  return (
    <Panel
      className={className}
      padded={false}
      title={t.activity.title}
      actions={
        <span
          className={cn(
            'inline-flex items-center gap-1.5 text-xs',
            mode === 'live' ? 'text-success' : 'text-muted-foreground',
          )}
        >
          <span
            aria-hidden
            className={cn(
              'size-1.5 rounded-full',
              mode === 'live' ? 'now-dot bg-success' : 'bg-muted-foreground/60',
            )}
          />
          {mode === 'paused' ? t.activity.paused : t.activity.live}
        </span>
      }
    >
      {shown.length === 0 ? (
        <EmptyState compact title={t.activity.empty} description={t.activity.emptyNote} />
      ) : (
        <ul className="divide-y divide-border">
          {shown.map((row) => (
            <ActivityItem
              key={row.id}
              row={row}
              currency={currency}
              timezone={timezone}
              dense
              fresh={fresh.has(row.id)}
            />
          ))}
        </ul>
      )}
      <div className="border-t border-border px-4 py-2">
        <Link
          href="/owner/activity"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t.activity.showAll}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    </Panel>
  );
}

/** Слить две ленты: без повторов, новые сверху. */
function merge(incoming: ActivityRow[], existing: ActivityRow[]): ActivityRow[] {
  const byId = new Map<string, ActivityRow>();
  for (const r of existing) byId.set(r.id, r);
  for (const r of incoming) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0)).slice(0, 200);
}
