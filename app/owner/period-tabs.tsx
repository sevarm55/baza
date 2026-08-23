'use client';

import { Segmented } from '@/components/patterns/segmented';
import { useT } from '@/lib/i18n/client';
import { periods, periodHref, type PeriodKey } from './periods';

/** Период сводки: сегодня, этот месяц, прошлый. Выбор живёт в адресе. */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  const t = useT();
  return (
    <Segmented
      current={current}
      label={t.owner.periodLabel}
      items={periods(t).map((x) => ({ key: x.key, label: x.label, href: periodHref(x.key) }))}
    />
  );
}
