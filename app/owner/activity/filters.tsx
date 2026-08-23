'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { Segmented } from '@/components/patterns/segmented';
import { Toolbar } from '@/components/patterns/toolbar';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import type { ActivityGroup } from '@/lib/activity-types';
import { useT } from '@/lib/i18n/client';

const GROUPS: ('all' | ActivityGroup)[] = ['all', 'cars', 'shifts', 'money', 'team', 'catalog', 'clients'];
import { PERIODS, type ActivityPeriod } from './period';

/**
 * Фильтры ленты живут в адресе: ссылку «что делал Арман вчера» можно
 * послать себе же. Группа и период переключаются сегментами, человек
 * выбирается списком.
 */
export function ActivityFilters({
  group,
  period,
  actor,
  actors,
}: {
  group: 'all' | ActivityGroup;
  period: ActivityPeriod;
  actor: string;
  actors: { id: string; name: string }[];
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (!v || v === 'all' || v === 'today') next.delete(k);
      else next.set(k, v);
    }
    const q = next.toString();
    return q ? `${pathname}?${q}` : pathname;
  };

  const periodLabel: Record<ActivityPeriod, string> = {
    today: t.activity.today,
    yesterday: t.activity.yesterday,
    week: t.common.week,
    month: t.common.month,
  };

  return (
    <Toolbar className="gap-3">
      <Segmented
        label={t.activity.period}
        size="sm"
        current={period}
        items={PERIODS.map((p) => ({ key: p, label: periodLabel[p], href: href({ d: p }) }))}
      />
      <Segmented
        label={t.activity.groups.all}
        size="sm"
        current={group}
        items={GROUPS.map((g) => ({ key: g, label: t.activity.groups[g], href: href({ g }) }))}
      />
      {actors.length > 0 && (
        <NativeSelect
          size="sm"
          className="ml-auto"
          aria-label={t.activity.who}
          value={actor}
          onChange={(e) => router.push(href({ who: e.target.value }))}
        >
          <NativeSelectOption value="">{t.activity.anyone}</NativeSelectOption>
          {actors.map((a) => (
            <NativeSelectOption key={a.id} value={a.id}>
              {a.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      )}
    </Toolbar>
  );
}
