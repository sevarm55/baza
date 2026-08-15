'use client';

import { Segmented } from '@/components/segmented';
import { hy } from '@/lib/i18n/hy';
import { PERIODS, periodHref, type PeriodKey } from './periods';

/**
 * Какой период открыт. Он же лежит в адресе, поэтому вкладки — ссылки:
 * сводку за прошлый месяц можно послать себе же в сообщение и открыть
 * в новой вкладке браузера.
 *
 * Разметка и поведение — общие для всех переключателей продукта, см.
 * `components/segmented.tsx`.
 */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  return (
    <Segmented
      id="period-tabs"
      current={current}
      full
      label={hy.owner.periodLabel}
      items={PERIODS.map((x) => ({ key: x.key, label: x.label, href: periodHref(x.key) }))}
    />
  );
}
