'use server';

import { revalidatePath } from 'next/cache';
import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { audit, tenants } from '@/lib/db/schema';
import { requirePlatformAdmin } from '@/lib/admin';
import { recordPayment } from '@/lib/admin-billing';

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

/**
 * Продлить подписку и записать платёж.
 *
 * Сумма приходит отдельным числом, а не выводится из месяцев: договор
 * бывает любым, и записывать надо то, что было, а не то, что должно было
 * быть по прайсу. Ноль — тоже допустимая сумма: подарить месяц знакомому
 * или закрыть претензию продлением это нормальный ход, и он тоже должен
 * остаться в истории.
 */
export async function extendSubscription(
  tenantId: string,
  months: number,
  amount: number,
  note?: string,
): Promise<void> {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  if (!Number.isInteger(months) || months < 1 || months > 36) return;
  if (!Number.isInteger(amount) || amount < 0) return;

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

  await recordPayment({ tenantId, amount, months, note, byUserId: admin.id });

  await logAdmin(tenantId, admin.id, 'subscription_extend', { months, amount });
  revalidatePath('/admin');
  revalidatePath('/admin/payments');
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
      /* У точки, заведённой второй, trial_ends_at пуст: пробный срок
         человек уже израсходовал. Верни мы ей 'trial', она молча стала бы
         'expired' — «срок вышел» у бизнеса, который ни дня не работал. */
      plan: sql`case
        when ${tenants.paidUntil} > now() then 'active'
        when ${tenants.trialEndsAt} is null then 'unpaid'
        else 'trial'
      end`,
    })
    .where(eq(tenants.id, tenantId));

  await logAdmin(tenantId, admin.id, 'tenant_unblock', {});
  revalidatePath('/admin');
}

/**
 * Заметка о клиенте.
 *
 * «Договорились на 12 000», «платит пятого», «брат Ашота». Владельцу
 * бизнеса не видна — она наша, и живёт рядом с его карточкой, потому что
 * вспоминается ровно в тот момент, когда на неё смотришь.
 */
export async function saveNote(tenantId: string, note: string): Promise<void> {
  const admin = await requirePlatformAdmin();
  await ensureDb();

  await db
    .update(tenants)
    .set({ adminNote: note.trim() || null })
    .where(eq(tenants.id, tenantId));

  await logAdmin(tenantId, admin.id, 'tenant_note', {});
  revalidatePath('/admin');
}
