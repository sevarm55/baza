'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { randomBytes } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';

import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { accounts, tenants, users } from '@/lib/db/schema';
import {
  adminLogin,
  adminSignOut,
  logAdminAction,
  requireAdmin,
  revokeAdminSession,
  type AdminLogin,
} from '@/lib/admin-auth';
import { recordPayment } from '@/lib/admin-billing';
import { revokeAccountSessions } from '@/lib/auth';
import { clientIp } from '@/lib/login-guard';
import { hashPin, NO_PIN } from '@/lib/pin';
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

/** Результат выдачи временного кода: сам код показывается один раз. */
export type TempAccessResult =
  | { ok: true; code: string; until: string }
  | { ok: false; error: string };

function reasonOf(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  return s.length >= 3 ? s.slice(0, 500) : null;
}

/* ------------------------------ вход ------------------------------ */

export async function adminLoginAction(input: { login: string; password: string }): Promise<AdminLogin> {
  await ensureDb();
  const h = await headers();
  return adminLogin({ login: input.login, password: input.password, ip: clientIp(h), agent: h.get('user-agent') });
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

/**
 * Временный ПИН: форс-мажор, когда войти нечем.
 *
 * Обычный путь восстановления — сброс доступа и вход по SMS. Он не
 * работает ровно тогда, когда нужнее всего: человек сменил номер, уехал
 * из страны, а у нас кончился баланс у оператора. Тогда админ выдаёт
 * временный код и диктует его по телефону.
 *
 * Что здесь важно и почему:
 *
 * 1. Код случайный, шесть цифр, и показывается ОДИН раз — тому, кто его
 *    выдал. В базе лежит только хеш, как у обычного: админ не должен
 *    иметь возможности подсмотреть чужой код завтра.
 * 2. У кода есть срок. Продиктованный по телефону код без срока
 *    остаётся вторым ключом от мойки навсегда — и у того, кто стоял
 *    рядом, тоже.
 * 3. Все сессии человека гасятся. Если доступ восстанавливают, старые
 *    входы либо не его, либо всё равно недоступны.
 * 4. Действие требует причину и пишется в оба журнала — админский и
 *    безопасности. Выдача чужого ключа обязана оставлять след.
 */
export async function issueTempAccessAction(input: {
  accountId: string;
  reason: string;
  /** сколько часов жить коду; по умолчанию сутки */
  hours?: number;
}): Promise<TempAccessResult> {
  const by = await requireAdmin('support');
  await ensureDb();
  const reason = reasonOf(input.reason);
  if (!reason) return { ok: false, error: 'reason' };

  const hours = Math.min(72, Math.max(1, Math.round(input.hours ?? 24)));
  const until = new Date(Date.now() + hours * 3600_000);

  /* Шесть цифр из криптографического источника, без ведущего нуля в
     первом разряде: код диктуют голосом, и «ноль-три-…» на слух теряется
     чаще остального. */
  const bytes = randomBytes(4).readUInt32BE(0);
  const code = String(100000 + (bytes % 900000));

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ pinHash: await hashPin(code), tempAccessUntil: until, tempAccessBy: by.name })
      .where(eq(accounts.id, input.accountId));
    /* Копия на участиях, пока она есть: старый код читает её. */
    await tx.update(users).set({ pinHash: await hashPin(code) }).where(eq(users.accountId, input.accountId));
  });
  await revokeAccountSessions(input.accountId);

  const phone = await accountPhone(input.accountId);
  await logAdminAction({
    by,
    action: 'account.temp_access',
    targetType: 'account',
    targetId: input.accountId,
    targetLabel: phone,
    reason,
  });
  await logSecurity({
    event: 'auth.pin.temp_issued',
    accountId: input.accountId,
    phone,
    data: { by: by.name, hours },
  });
  revalidatePath('/admin', 'layout');
  return { ok: true, code, until: until.toISOString() };
}

/* ----------------------------- сессии ----------------------------- */

export async function revokeAdminSessionAction(input: { sessionId: string }): Promise<ActionResult> {
  const by = await requireAdmin();
  await ensureDb();
  await revokeAdminSession(input.sessionId, by);
  await logAdminAction({ by, action: 'admin.session_revoke', targetType: 'session', targetId: input.sessionId });
  revalidatePath('/admin/access');
  return { ok: true };
}
