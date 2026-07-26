'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { audit, tenants } from '@/lib/db/schema';
import { requirePlatformAdmin } from '@/lib/admin';

/**
 * Действия админки платформы.
 *
 * Каждое само проверяет права: server action — открытый POST-эндпоинт,
 * и знание идентификатора чужого бизнеса не должно ничего давать.
 * Каждое оставляет след в аудите — потом будет видно, кто и когда включал.
 */

async function logAdmin(
  tenantId: string,
  adminId: string,
  action: string,
  data: Record<string, unknown>,
) {
  await db.insert(audit).values({
    tenantId,
    userId: adminId,
    action,
    entity: 'tenant',
    entityId: tenantId,
    data,
  });
}

/** Продлить подписку. Считаем от текущей даты окончания, если она ещё не прошла. */
export async function extendSubscription(tenantId: string, months: number): Promise<void> {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  if (!Number.isInteger(months) || months < 1 || months > 36) return;

  await db
    .update(tenants)
    .set({
      plan: 'active',
      // greatest(): оплативший заранее не должен терять остаток
      paidUntil: sql`greatest(now(), coalesce(${tenants.paidUntil}, now())) + ${sql.raw(
        `interval '${months} months'`,
      )}`,
    })
    .where(eq(tenants.id, tenantId));

  await logAdmin(tenantId, admin.id, 'subscription_extend', { months });
  revalidatePath('/admin');
}

/** Отключить доступ целиком. Данные остаются — включим обратно, всё на месте. */
export async function blockTenant(tenantId: string): Promise<void> {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  await db.update(tenants).set({ plan: 'blocked' }).where(eq(tenants.id, tenantId));
  await logAdmin(tenantId, admin.id, 'tenant_block', {});
  revalidatePath('/admin');
}

/**
 * Вернуть доступ.
 *
 * Если оплата ещё действует — снова active. Если нет — trial, но без
 * продления: иначе отключение и включение подряд дарило бы новый срок.
 */
export async function unblockTenant(tenantId: string): Promise<void> {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  await db
    .update(tenants)
    .set({
      plan: sql`case when ${tenants.paidUntil} > now() then 'active' else 'trial' end`,
    })
    .where(eq(tenants.id, tenantId));

  await logAdmin(tenantId, admin.id, 'tenant_unblock', {});
  revalidatePath('/admin');
}
