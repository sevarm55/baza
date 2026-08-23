import { redirect } from 'next/navigation';

import { requireOwner } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant } from '@/lib/queries';
import { activityActors, listActivity, type ActivityGroup } from '@/lib/activity';
import { startOfDay, startOfDaysAgo, startOfMonth } from '@/lib/time';
import { getDict } from '@/lib/i18n/server';
import { PageHeader } from '@/components/patterns/page-header';
import { ActivityFilters } from './filters';
import { PERIODS, type ActivityPeriod } from './period';
import { ActivityList } from './list';

const PAGE = 100;
const GROUPS: ActivityGroup[] = ['cars', 'shifts', 'money', 'team', 'catalog', 'clients'];

/**
 * Вся активность: то же, что панель на сводке, но целиком и с фильтрами.
 *
 * Отвечает на вопросы, которые панель не вмещает: что было вчера, что
 * делал конкретный человек, сколько раз за месяц отменяли машины.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; d?: string; who?: string }>;
}) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const tenant = await getTenant(session.tid);
  if (!tenant) redirect('/session-ended');

  const sp = await searchParams;
  const group = (GROUPS as string[]).includes(sp.g ?? '') ? (sp.g as ActivityGroup) : 'all';
  const period: ActivityPeriod = (PERIODS as readonly string[]).includes(sp.d ?? '')
    ? (sp.d as ActivityPeriod)
    : 'today';
  const actor = sp.who ?? '';

  const tz = tenant.timezone;
  const today = startOfDay(tz);
  const range =
    period === 'today'
      ? { from: today, to: undefined }
      : period === 'yesterday'
        ? { from: startOfDaysAgo(tz, 1), to: today }
        : period === 'week'
          ? { from: startOfDaysAgo(tz, 6), to: undefined }
          : { from: startOfMonth(tz), to: undefined };

  const [rows, actors] = await Promise.all([
    listActivity(tenant.id, {
      from: range.from,
      to: range.to,
      groups: group === 'all' ? undefined : [group],
      actorId: actor || undefined,
      limit: PAGE,
    }),
    activityActors(tenant.id, startOfMonth(tz)),
  ]);

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.activity.all} description={t.activity.lead}>
        <ActivityFilters group={group} period={period} actor={actor} actors={actors} />
      </PageHeader>

      <ActivityList
        initial={rows}
        pageSize={PAGE}
        currency={tenant.currency}
        timezone={tz}
        group={group}
        actor={actor}
        from={range.from.toISOString()}
        to={range.to?.toISOString()}
        filtered={group !== 'all' || !!actor}
      />
    </div>
  );
}
