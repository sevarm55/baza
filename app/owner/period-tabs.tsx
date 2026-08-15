'use client';

import { Segmented } from '@/components/segmented';
import { periods, periodHref, type PeriodKey } from './periods';
import { useT } from '@/lib/i18n/client';

/**
 * Какой период открыт. Он же лежит в адресе, поэтому вкладки — ссылки:
 * сводку за прошлый месяц можно послать себе же в сообщение и открыть
 * в новой вкладке браузера.
 *
 * Разметка и поведение — общие для всех переключателей продукта, см.
 * `components/segmented.tsx`.
 */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  const t = useT();
  return (
    <Segmented
      id="period-tabs"
      current={current}
      full
      label={t.owner.periodLabel}
      items={periods(t).map((x) => ({ key: x.key, label: x.label, href: periodHref(x.key) }))}
    />
  );
}
