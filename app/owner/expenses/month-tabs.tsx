'use client';

import { Segmented } from '@/components/segmented';
import { useT } from '@/lib/i18n/client';

export type MonthKey = 'current' | 'prev';

/**
 * Какой месяц смотрим.
 *
 * Тот же переключатель, что на сводке, и намеренно: два соседних раздела
 * не должны выбирать период разными способами. Разница только в наборе —
 * у расходов «сегодня» смысла не имеет, постоянные не относятся к
 * одному дню.
 */
export function MonthTabs({ current }: { current: MonthKey }) {
  const t = useT();
  return (
    <Segmented
      id="expense-month"
      current={current}
      full
      label={t.owner.periodLabel}
      items={[
        { key: 'current', label: t.owner.periodMonth, href: '/owner/expenses' },
        { key: 'prev', label: t.owner.periodPrevMonth, href: '/owner/expenses?m=prev' },
      ]}
    />
  );
}
