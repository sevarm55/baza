import { and, desc, eq, gt, inArray, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { activityEvents, users, type ActivityEvent } from './db/schema';

/**
 * Живая лента бизнеса.
 *
 * Событие это фраза владельцу: «Давид записал 77GG477 · Комплекс ·
 * 5 000 ֏», «Арман вышел на смену», «Арман изменил оплату → Карта».
 * Сюда попадает только то, что имеет бизнес-смысл; нажатия по кнопкам,
 * открытия страниц и прочий технический шум не пишутся вовсе.
 *
 * Пишется внутри той же транзакции, что и сам факт, где это возможно:
 * событие без факта и факт без события одинаково врут. Там, где факт
 * пишется вне транзакции (смены, услуги), событие пишется следом и не
 * роняет вызывающего: мойщик обязан выйти на смену, даже если лента
 * по какой-то причине не записалась.
 *
 * СЕКРЕТОВ В `data` НЕТ: сюда кладётся только то, что нужно для фразы.
 * Список ключей закрыт типом `ActivityData`, свободного мешка нет.
 */

export type {
  ActivityType,
  ActivityEntity,
  ActorRole,
  ActivityGroup,
  ActivityData,
  ActivityRow,
} from './activity-types';
export { GROUP_OF, ENTITY_OF } from './activity-types';
import {
  ENTITY_OF,
  GROUP_OF,
  type ActivityData,
  type ActivityEntity,
  type ActivityGroup,
  type ActivityRow,
  type ActivityType,
  type ActorRole,
} from './activity-types';

export type NewActivity = {
  tenantId: string;
  type: ActivityType;
  actorId?: string | null;
  /** имя снимком; если не передано, берётся из users по actorId */
  actorName?: string | null;
  actorRole?: ActorRole;
  entityId?: string | null;
  data?: ActivityData;
  at?: Date;
};

/** Чем можно писать: сама база или открытая транзакция. */
type Executor = Pick<typeof db, 'insert' | 'select'>;

function clean(data: ActivityData | undefined): Record<string, unknown> | null {
  if (!data) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 120);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
    else if (Array.isArray(v)) out[k] = v.slice(0, 8).map((x) => String(x).slice(0, 60));
  }
  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Записать событие тем же исполнителем, что и факт.
 *
 * Внутри транзакции ошибка вставки обязана уронить транзакцию целиком:
 * иначе факт останется без следа. Поэтому здесь нет try/catch; его
 * ставит `recordActivitySafely` для мест вне транзакции.
 */
export async function recordActivity(exec: Executor, input: NewActivity): Promise<void> {
  let actorName = input.actorName ?? null;
  let actorRole: ActorRole = input.actorRole ?? 'staff';

  if (input.actorId && (!input.actorName || !input.actorRole)) {
    const [who] = await exec
      .select({ name: users.name, role: users.role })
      .from(users)
      .where(eq(users.id, input.actorId));
    if (who) {
      actorName ??= who.name;
      if (!input.actorRole) actorRole = who.role === 'owner' ? 'owner' : 'staff';
    }
  }
  if (!input.actorId && !input.actorRole) actorRole = 'system';

  await exec.insert(activityEvents).values({
    tenantId: input.tenantId,
    actorId: input.actorId ?? null,
    actorName,
    actorRole,
    eventType: input.type,
    entityType: ENTITY_OF[input.type],
    entityId: input.entityId ?? null,
    data: clean(input.data),
    ...(input.at ? { createdAt: input.at } : {}),
  });
}

/** То же, но вне транзакции и без права уронить вызывающего. */
export async function recordActivitySafely(input: NewActivity): Promise<void> {
  try {
    await recordActivity(db, input);
  } catch (e) {
    console.error('[activity] не записалось:', input.type, e);
  }
}

/* ------------------------------ чтение ------------------------------ */

export function toRow(e: ActivityEvent): ActivityRow {
  return {
    id: e.id,
    type: e.eventType as ActivityType,
    entity: e.entityType as ActivityEntity,
    entityId: e.entityId,
    actorId: e.actorId,
    actorName: e.actorName,
    actorRole: (e.actorRole as ActorRole) ?? 'staff',
    data: (e.data ?? {}) as ActivityData,
    at: e.createdAt.toISOString(),
  };
}

export type ActivityFilter = {
  /** только эти группы */
  groups?: ActivityGroup[];
  /** только этот человек */
  actorId?: string;
  from?: Date;
  to?: Date;
};

function typesOf(groups: ActivityGroup[] | undefined): ActivityType[] | null {
  if (!groups || groups.length === 0) return null;
  const set = new Set(groups);
  return (Object.keys(GROUP_OF) as ActivityType[]).filter((t) => set.has(GROUP_OF[t]));
}

/**
 * Свежие события, новые сверху.
 *
 * `before` листает назад (страница активности), `after` догоняет вперёд
 * (живая лента). Границы по времени, а не по номеру страницы: между
 * двумя запросами лента успевает вырасти, и нумерация страниц дала бы
 * одно и то же событие дважды.
 */
export async function listActivity(
  tenantId: string,
  opts: ActivityFilter & { limit?: number; before?: Date; after?: Date } = {},
): Promise<ActivityRow[]> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const types = typesOf(opts.groups);

  const rows = await db
    .select()
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.tenantId, tenantId),
        types ? inArray(activityEvents.eventType, types) : undefined,
        opts.actorId ? eq(activityEvents.actorId, opts.actorId) : undefined,
        opts.from ? gt(activityEvents.createdAt, opts.from) : undefined,
        opts.to ? lt(activityEvents.createdAt, opts.to) : undefined,
        opts.before ? lt(activityEvents.createdAt, opts.before) : undefined,
        opts.after ? gt(activityEvents.createdAt, opts.after) : undefined,
      ),
    )
    .orderBy(desc(activityEvents.createdAt), desc(activityEvents.id))
    .limit(limit);

  return rows.map(toRow);
}

/** Сколько событий каждого вида было за отрезок: для подписей фильтра. */
export async function countActivity(
  tenantId: string,
  from: Date,
  to?: Date,
): Promise<Partial<Record<ActivityType, number>>> {
  const rows = await db
    .select({ type: activityEvents.eventType, n: sql<number>`count(*)::int` })
    .from(activityEvents)
    .where(
      and(
        eq(activityEvents.tenantId, tenantId),
        gt(activityEvents.createdAt, from),
        to ? lt(activityEvents.createdAt, to) : undefined,
      ),
    )
    .groupBy(activityEvents.eventType);

  const out: Partial<Record<ActivityType, number>> = {};
  for (const r of rows) out[r.type as ActivityType] = r.n;
  return out;
}

/** Кто появлялся в ленте: для фильтра по человеку. */
export async function activityActors(
  tenantId: string,
  from: Date,
): Promise<{ id: string; name: string }[]> {
  const rows = await db
    .select({ id: activityEvents.actorId, name: activityEvents.actorName })
    .from(activityEvents)
    .where(and(eq(activityEvents.tenantId, tenantId), gt(activityEvents.createdAt, from)))
    .groupBy(activityEvents.actorId, activityEvents.actorName);

  return rows
    .filter((r): r is { id: string; name: string } => !!r.id && !!r.name)
    .sort((a, b) => a.name.localeCompare(b.name));
}
