'use client';

import { Segmented } from '@/components/segmented';
import { hy } from '@/lib/i18n/hy';

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
  return (
    <Segmented
      id="expense-month"
      current={current}
      full
      label={hy.owner.periodLabel}
      items={[
        { key: 'current', label: hy.owner.periodMonth, href: '/owner/expenses' },
        { key: 'prev', label: hy.owner.periodPrevMonth, href: '/owner/expenses?m=prev' },
      ]}
    />
  );
}
