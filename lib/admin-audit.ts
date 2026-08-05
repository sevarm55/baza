import { and, desc, eq, gt, inArray } from 'drizzle-orm';
import { db } from './db';
import { audit, tenants, users } from './db/schema';

/**
 * Журнал: что мы делали с чужими бизнесами.
 *
 * Продление, отключение и заметки писались в аудит и раньше, но лежали
 * вперемешку с записями самих моек и никем не читались. Отдельная лента
 * нужна не для порядка ради порядка: мы смотрим в книги живых компаний,
 * и на вопрос «кто и когда открывал мои цифры» должен быть ответ, а не
 * обещание.
 */

/** Действия админки платформы — по ним же строится лента. */
const ADMIN_ACTIONS = [
  'tenant_view',
  'subscription_extend',
  'tenant_block',
  'tenant_unblock',
  'tenant_note',
] as const;

/**
 * Отметить просмотр карточки клиента.
 *
 * Один заход — одна строка, повторные в течение получаса не пишутся.
 * Иначе журнал состоял бы из сотни «посмотрел» подряд после каждого
 * обновления страницы, и в нём стало бы невозможно найти продление.
 */
export async function logTenantView(tenantId: string, adminId: string, now = new Date()) {
  const since = new Date(now.getTime() - 30 * 60 * 1000);

  const [recent] = await db
    .select({ id: audit.id })
    .from(audit)
    .where(
      and(
        eq(audit.tenantId, tenantId),
        eq(audit.userId, adminId),
        eq(audit.action, 'tenant_view'),
        gt(audit.createdAt, since),
      ),
    )
    .limit(1);

  if (recent) return false;

  await db.insert(audit).values({
    tenantId,
    userId: adminId,
    action: 'tenant_view',
    entity: 'tenant',
    entityId: tenantId,
    data: {},
  });

  return true;
}

export type JournalRow = {
  id: string;
  action: string;
  data: unknown;
  at: Date;
  tenantId: string;
  tenantName: string;
  adminName: string | null;
};

export async function adminJournal(limit = 200): Promise<JournalRow[]> {
  return db
    .select({
      id: audit.id,
      action: audit.action,
      data: audit.data,
      at: audit.createdAt,
      tenantId: audit.tenantId,
      tenantName: tenants.name,
      adminName: users.name,
    })
    .from(audit)
    .innerJoin(tenants, eq(tenants.id, audit.tenantId))
    .leftJoin(users, eq(users.id, audit.userId))
    .where(inArray(audit.action, [...ADMIN_ACTIONS]))
    .orderBy(desc(audit.createdAt))
    .limit(limit);
}
