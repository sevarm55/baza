'use client';

import Link from 'next/link';
import { hy } from '@/lib/i18n/hy';
import { SwitchMark } from '@/components/switch-mark';

export type MonthKey = 'current' | 'prev';

/**
 * Какой месяц смотрим.
 *
 * Тот же переключатель, что на сводке, и намеренно: два соседних раздела
 * не должны выбирать период разными способами. Разница только в наборе —
 * у расходов «сегодня» смысла не имеет, постоянные не относятся к
 * одному дню.
 */
const TABS: { key: MonthKey; label: string }[] = [
  { key: 'current', label: hy.owner.periodMonth },
  { key: 'prev', label: hy.owner.periodPrevMonth },
];

export function MonthTabs({ current }: { current: MonthKey }) {
  return (
    <div
      className="flex w-full gap-0.5 rounded-[8px] p-[3px] sm:w-auto"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
    >
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === 'current' ? '/owner/expenses' : `/owner/expenses?m=${t.key}`}
          aria-current={current === t.key ? 'page' : undefined}
          className="relative flex-1 rounded-[6px] px-3 py-1.5 text-center text-[13px] transition-colors sm:flex-none"
          style={
            current === t.key
              ? { color: 'var(--board)', fontWeight: 600 }
              : { color: 'var(--board-muted)' }
          }
        >
          {current === t.key && <SwitchMark id="expense-month" radius={6} />}
          <span className="relative z-[1]">{t.label}</span>
        </Link>
      ))}
    </div>
  );
}
