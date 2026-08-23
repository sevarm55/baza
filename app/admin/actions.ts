'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { accounts, adminSessions, platformAdmins, tenants, users } from '@/lib/db/schema';
import {
  adminLoginStart,
  adminLoginVerify,
  adminSignOut,
  asAdminRole,
  logAdminAction,
  requireAdmin,
  revokeAdminSession,
  type AdminLoginStart,
  type AdminLoginVerify,
} from '@/lib/admin-auth';
import { recordPayment } from '@/lib/admin-billing';
import { revokeAccountSessions } from '@/lib/auth';
import { clientIp } from '@/lib/login-guard';
import { NO_PIN } from '@/lib/pin';
import { normalizePhone } from '@/lib/phone';
import { logSecurity } from '@/lib/security-log';

/**
 * Действия админки.
 *
 * Каждое само проверяет роль: server action это открытый POST, и
 * знание чужого идентификатора не должно ничего давать. Опасные
 * действия требуют причину и оставляют след в `admin_audit` и журнале
 * безопасности. Ошибки возвращаются строкой для формы, а не падают.
 */

export type ActionResult = { ok: true } | { ok: false; error: string };

function reasonOf(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return s.length >= 3 ? s.slice(0, 500) : null;
}

/* ------------------------------ вход ------------------------------ */

export async function adminLoginStartAction(input: { phone: string; pin: string }): Promise<AdminLoginStart> {
  await ensureDb();
  const h = await headers();
  return adminLoginStart({ phone: input.phone, pin: input.pin, ip: clientIp(h), agent: h.get('user-agent') });
}

export async function adminLoginVerifyAction(input: { challengeId: string; code: string }): Promise<AdminLoginVerify> {
  await ensureDb();
  const h = await headers();
  const result = await adminLoginVerify({
    challengeId: input.challengeId,
    code: input.code,
    ip: clientIp(h),
    agent: h.get('user-agent'),
  });
  return result;
}

export async function adminSignOutAction(): Promise<void> {
  await adminSignOut();
  redirect('/admin/login');
}

/* ----------------------------- бизнесы ----------------------------- */

async function tenantLabel(tenantId: string): Promise<string | null> {
  const [t] = await db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, tenantId));
  return t?.name ?? null;
}

export async function extendSubscriptionAction(input: {
  tenantId: string;
  months: number;
  amount: number;
  note?: string;
}): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const { tenantId, months, amount } = input;
  if (!Number.isInteger(months) || months < 1 || months > 36) return { ok: false, error: 'months' };
  if (!Number.isInteger(amount) || amount < 0) return { ok: false, error: 'amount' };

  await db
    .update(tenants)
    .set({
      plan: 'active',
      // greatest(): оплативший заранее не должен терять остаток
      paidUntil: sql`greatest(now(), coalesce(${tenants.paidUntil}, now())) + ${sql.raw(`interval '${months} months'`)}`,
    })
    .where(eq(tenants.id, tenantId));

  /* Платёж записывается от участия админа в каком-то бизнесе раньше;
     теперь админ это не участие, и `by_user_id` остаётся пустым. Кто
     продлил, отвечает `admin_audit`. */
  await recordPayment({ tenantId, amount, months, note: input.note, byUserId: null });

  await logAdminAction({
    by,
    action: 'subscription.extend',
    targetType: 'tenant',
    targetId: tenantId,
    targetLabel: await tenantLabel(tenantId),
    reason: input.note ?? null,
    data: { months, amount },
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function blockTenantAction(input: { tenantId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  await db.update(tenants).set({ plan: 'blocked' }).where(eq(tenants.id, input.tenantId));
  await logAdminAction({
    by,
    action: 'tenant.block',
    targetType: 'tenant',
    targetId: input.tenantId,
    targetLabel: await tenantLabel(input.tenantId),
    reason,
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function unblockTenantAction(input: { tenantId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  await db
    .update(tenants)
    .set({
      /* У точки, заведённой второй, trial_ends_at пуст: пробный срок
         человек уже израсходовал. Верни мы ей 'trial', она молча стала бы
         'expired' у бизнеса, который ни дня не работал. */
      plan: sql`case
        when ${tenants.paidUntil} > now() then 'active'
        when ${tenants.trialEndsAt} is null then 'unpaid'
        else 'trial'
      end`,
    })
    .where(eq(tenants.id, input.tenantId));
  await logAdminAction({
    by,
    action: 'tenant.unblock',
    targetType: 'tenant',
    targetId: input.tenantId,
    targetLabel: await tenantLabel(input.tenantId),
    reason,
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function saveTenantNoteAction(input: { tenantId: string; note: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  await db
    .update(tenants)
    .set({ adminNote: input.note.trim().slice(0, 1000) || null })
    .where(eq(tenants.id, input.tenantId));
  await logAdminAction({
    by,
    action: 'tenant.note',
    targetType: 'tenant',
    targetId: input.tenantId,
    targetLabel: await tenantLabel(input.tenantId),
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

/* ------------------------------ люди ------------------------------ */

async function accountPhone(accountId: string): Promise<string | null> {
  const [a] = await db.select({ phone: accounts.phone }).from(accounts).where(eq(accounts.id, accountId));
  return a?.phone ?? null;
}

export async function blockAccountAction(input: { accountId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };
  /* Себя заблокировать нельзя: это запирает дверь изнутри. */
  if (input.accountId === by.admin.accountId) return { ok: false, error: 'self' };

  await db
    .update(accounts)
    .set({ blockedAt: new Date(), blockedReason: reason })
    .where(eq(accounts.id, input.accountId));
  /* Вход закрывается сразу, а не когда истечёт cookie. */
  await revokeAccountSessions(input.accountId);

  const phone = await accountPhone(input.accountId);
  await logAdminAction({ by, action: 'account.block', targetType: 'account', targetId: input.accountId, targetLabel: phone, reason });
  await logSecurity({ event: 'auth.session.revoked_all', accountId: input.accountId, phone, data: { by: 'admin', reason: 'BLOCKED' } });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function unblockAccountAction(input: { accountId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  await db.update(accounts).set({ blockedAt: null, blockedReason: null }).where(eq(accounts.id, input.accountId));
  await logAdminAction({
    by,
    action: 'account.unblock',
    targetType: 'account',
    targetId: input.accountId,
    targetLabel: await accountPhone(input.accountId),
    reason,
  });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

export async function logoutAccountAction(input: { accountId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  await revokeAccountSessions(input.accountId);
  const phone = await accountPhone(input.accountId);
  await logAdminAction({ by, action: 'account.logout_all', targetType: 'account', targetId: input.accountId, targetLabel: phone, reason });
  await logSecurity({ event: 'auth.session.revoked_all', accountId: input.accountId, phone, data: { by: 'admin' } });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

/**
 * Сбросить доступ: убрать PIN и погасить сессии. Человек войдёт по коду
 * из SMS и задаст новый PIN сам. Ставить PIN за него админ не может и
 * не должен: код, известный двоим, уже не код.
 */
export async function resetAccessAction(input: { accountId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };
  if (input.accountId === by.admin.accountId) return { ok: false, error: 'self' };

  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ pinHash: NO_PIN }).where(eq(accounts.id, input.accountId));
    /* Копия на участиях, пока она есть: старый код читает её. */
    await tx.update(users).set({ pinHash: NO_PIN }).where(eq(users.accountId, input.accountId));
  });
  await revokeAccountSessions(input.accountId);

  const phone = await accountPhone(input.accountId);
  await logAdminAction({ by, action: 'account.reset_access', targetType: 'account', targetId: input.accountId, targetLabel: phone, reason });
  await logSecurity({ event: 'auth.pin.reset', accountId: input.accountId, phone, data: { by: 'admin' } });
  revalidatePath('/admin', 'layout');
  return { ok: true };
}

/* ----------------------------- команда ----------------------------- */

export async function addAdminAction(input: { phone: string; name: string; role: string }): Promise<ActionResult> {
  const by = await requireAdmin('owner');
  await ensureDb();
  const phone = normalizePhone(input.phone);
  const name = input.name.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: 'name' };

  const [account] = await db.select().from(accounts).where(eq(accounts.phone, phone));
  if (!account) return { ok: false, error: 'notFound' };

  const [existing] = await db.select().from(platformAdmins).where(eq(platformAdmins.accountId, account.id));
  if (existing && existing.active) return { ok: false, error: 'exists' };

  const role = asAdminRole(input.role);
  if (existing) {
    await db.update(platformAdmins).set({ active: true, role, name }).where(eq(platformAdmins.id, existing.id));
  } else {
    await db.insert(platformAdmins).values({ accountId: account.id, name, role, createdBy: by.admin.id });
  }
  await logAdminAction({ by, action: 'admin.add', targetType: 'admin', targetId: account.id, targetLabel: `${name} · ${phone}`, data: { role } });
  revalidatePath('/admin/team');
  return { ok: true };
}

export async function setAdminRoleAction(input: { adminId: string; role: string }): Promise<ActionResult> {
  const by = await requireAdmin('owner');
  await ensureDb();
  if (input.adminId === by.admin.id) return { ok: false, error: 'self' };
  const role = asAdminRole(input.role);
  const [row] = await db.update(platformAdmins).set({ role }).where(eq(platformAdmins.id, input.adminId)).returning();
  if (!row) return { ok: false, error: 'notFound' };
  await logAdminAction({ by, action: 'admin.role', targetType: 'admin', targetId: row.accountId, targetLabel: row.name, data: { role } });
  revalidatePath('/admin/team');
  return { ok: true };
}

export async function deactivateAdminAction(input: { adminId: string; reason: string }): Promise<ActionResult> {
  const by = await requireAdmin('owner');
  await ensureDb();
  if (input.adminId === by.admin.id) return { ok: false, error: 'self' };
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  const [row] = await db.update(platformAdmins).set({ active: false }).where(eq(platformAdmins.id, input.adminId)).returning();
  if (!row) return { ok: false, error: 'notFound' };
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.adminId, input.adminId), isNull(adminSessions.revokedAt)));
  await logAdminAction({ by, action: 'admin.deactivate', targetType: 'admin', targetId: row.accountId, targetLabel: row.name, reason });
  revalidatePath('/admin/team');
  return { ok: true };
}

export async function revokeAdminSessionAction(input: { sessionId: string }): Promise<ActionResult> {
  const by = await requireAdmin('viewer');
  await ensureDb();
  /* Свою сессию может погасить любой; чужую только владелец платформы. */
  const [row] = await db.select().from(adminSessions).where(eq(adminSessions.id, input.sessionId));
  if (!row) return { ok: false, error: 'notFound' };
  if (row.adminId !== by.admin.id && by.role !== 'owner') return { ok: false, error: 'forbidden' };

  await revokeAdminSession(input.sessionId, by);
  await logAdminAction({ by, action: 'admin.session_revoke', targetType: 'session', targetId: input.sessionId });
  revalidatePath('/admin/team');
  return { ok: true };
}
