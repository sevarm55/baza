import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { SignJWT, jwtVerify } from 'jose';
import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { db } from './db';
import { accounts, adminAudit, adminSessions, platformAdmins, type PlatformAdmin } from './db/schema';
import { accountByPhone } from './accounts';
import { hashPin, verifyPin } from './pin';
import { checkLogin, clientIp, noteLogin } from './login-guard';
import { startChallenge, verifyChallenge } from './otp';
import { isValidPhone, maskPhone, normalizePhone } from './phone';
import { logSecurity } from './security-log';

/**
 * Вход и сессии админки платформы.
 *
 * Отдельно от кабинета по трём причинам:
 *
 *   1. своя cookie (`bz_admin`, SameSite=Strict, только под /admin):
 *      вход в мойку не открывает админку, выход из админки не закрывает
 *      мойку, а чужой сайт не может отправить запрос в админку вовсе;
 *   2. свой срок: двенадцать часов и два часа простоя, не тридцать дней.
 *      Здесь отключают бизнесы и правят чужие подписки, и забытая
 *      вкладка не должна оставаться ключом на месяц;
 *   3. свой второй фактор: после PIN всегда код из SMS, без исключений
 *      для знакомых устройств. Та же инфраструктура кодов, что у входа
 *      владельца (`lib/otp.ts`); новой криптографии здесь нет.
 *
 * Кто админ, решает таблица `platform_admins`, а не переменная
 * окружения. Переменная `PLATFORM_ADMIN_PHONES` осталась одним делом:
 * завести первого админа владельцем платформы при его первом входе,
 * когда таблица ещё пуста. Дальше админов заводят из самой админки.
 */

export const ADMIN_COOKIE = 'bz_admin';
const SESSION_HOURS = 12;
const IDLE_MINUTES = 120;
const TOUCH_MINUTES = 2;

export type AdminRole = 'owner' | 'support' | 'viewer';
const RANK: Record<AdminRole, number> = { viewer: 0, support: 1, owner: 2 };

export function asAdminRole(raw: unknown): AdminRole {
  return raw === 'owner' || raw === 'support' || raw === 'viewer' ? raw : 'viewer';
}

/** Хватает ли роли: владелец платформы может всё, что может поддержка. */
export function roleAtLeast(role: AdminRole, need: AdminRole): boolean {
  return RANK[role] >= RANK[need];
}

/* Ключ подписи свой, выведенный из общего: утечка одного секрета не
   должна подписывать cookie другого контура. */
const secret = new TextEncoder().encode(
  `admin:${process.env.ADMIN_SESSION_SECRET ?? process.env.SESSION_SECRET ?? 'dev-only-insecure-secret-please-change-me-now'}`,
);

type AdminClaims = { aid: string; sid: string };

async function sign(claims: AdminClaims): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret);
}

async function read(token: string): Promise<AdminClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    const { aid, sid } = payload as Record<string, unknown>;
    return typeof aid === 'string' && typeof sid === 'string' ? { aid, sid } : null;
  } catch {
    return null;
  }
}

function bootstrapPhones(): string[] {
  return (process.env.PLATFORM_ADMIN_PHONES ?? '')
    .split(',')
    .map((p) => normalizePhone(p.trim()))
    .filter(Boolean);
}

/** Сколько админов заведено: нужно только для первого входа. */
async function adminCount(): Promise<number> {
  const rows = await db.select({ id: platformAdmins.id }).from(platformAdmins).limit(1);
  return rows.length;
}

/* ------------------------------ вход ------------------------------ */

export type AdminLoginStart =
  | { ok: true; challengeId: string; phoneMasked: string; resendAt: Date; expiresAt: Date }
  | { ok: false; problem: 'DENIED' | 'THROTTLED' | 'SMS_FAILED'; retryAfter?: number };

/**
 * Первый шаг: телефон и PIN. Ответ на «не тот номер» и «не тот код»
 * один и тот же: админка не должна подтверждать, чьи номера в ней есть.
 * Успех здесь ещё не вход: дальше код из SMS.
 */
export async function adminLoginStart(input: {
  phone: string;
  pin: string;
  ip: string | null;
  agent?: string | null;
}): Promise<AdminLoginStart> {
  const phone = normalizePhone(input.phone);
  if (!isValidPhone(phone)) return { ok: false, problem: 'DENIED' };

  const guard = await checkLogin(phone, input.ip);
  if (!guard.allowed) {
    await logSecurity({ event: 'auth.login.throttled', phone, ip: input.ip, data: { flow: 'admin' } });
    return { ok: false, problem: 'THROTTLED', retryAfter: guard.retryAfter };
  }

  const account = await accountByPhone(phone);
  let admin = account ? await adminByAccount(account.id) : undefined;

  /* Первый админ заводится из переменной окружения владельцем
     платформы, и только пока таблица пуста. После этого переменная не
     решает ничего: даже если в ней останется чужой номер. */
  if (!admin && account && bootstrapPhones().includes(phone) && (await adminCount()) === 0) {
    const [created] = await db
      .insert(platformAdmins)
      .values({ accountId: account.id, name: 'Admin', role: 'owner' })
      .returning();
    admin = created;
  }

  /* Проверка PIN идёт всегда, даже когда админа нет: время ответа не
     должно отличать «не админ» от «не тот PIN». */
  const good = account && admin?.active ? await verifyPin(input.pin, account.pinHash) : await decoyCheck(input.pin);
  await noteLogin(phone, input.ip, good);

  if (!good || !account || !admin) {
    await logSecurity({
      event: 'admin.login.failed',
      phone,
      ip: input.ip,
      agent: input.agent,
      accountId: account?.id ?? null,
      data: { reason: admin ? (admin.active ? 'WRONG_PIN' : 'INACTIVE') : 'NOT_ADMIN' },
    });
    return { ok: false, problem: 'DENIED' };
  }

  const started = await startChallenge({
    purpose: 'admin_login',
    phone,
    ip: input.ip,
    accountId: account.id,
    payload: { adminId: admin.id },
    locale: 'ru',
  });

  if (!started.ok) {
    return started.reason === 'THROTTLED'
      ? { ok: false, problem: 'THROTTLED', retryAfter: started.retryAfter }
      : { ok: false, problem: 'SMS_FAILED' };
  }

  await logSecurity({
    event: 'admin.login.step_up',
    phone,
    ip: input.ip,
    agent: input.agent,
    accountId: account.id,
  });

  return {
    ok: true,
    challengeId: started.challengeId,
    phoneMasked: maskPhone(phone),
    resendAt: started.resendAt,
    expiresAt: started.expiresAt,
  };
}

let decoy: Promise<string> | null = null;
async function decoyCheck(pin: string): Promise<false> {
  decoy ??= hashPin(`decoy:${Math.random()}`);
  await verifyPin(pin, await decoy);
  return false;
}

export type AdminLoginVerify =
  | { ok: true }
  | { ok: false; problem: 'INVALID' | 'EXPIRED' | 'TOO_MANY_TRIES' | 'DENIED' };

/** Второй шаг: код из SMS. На успехе открывается сессия админки. */
export async function adminLoginVerify(input: {
  challengeId: string;
  code: string;
  ip: string | null;
  agent?: string | null;
}): Promise<AdminLoginVerify> {
  const verified = await verifyChallenge<{ adminId?: string }>({
    challengeId: input.challengeId,
    code: input.code,
    purpose: 'admin_login',
    ip: input.ip,
  });
  if (!verified.ok) return { ok: false, problem: verified.reason };

  const adminId = verified.payload.adminId;
  const admin = adminId ? await adminById(adminId) : undefined;
  if (!admin || !admin.active) {
    await logSecurity({
      event: 'admin.login.failed',
      phone: verified.challenge.phone,
      ip: input.ip,
      agent: input.agent,
      data: { reason: 'INACTIVE' },
    });
    return { ok: false, problem: 'DENIED' };
  }

  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3_600_000);
  const [session] = await db
    .insert(adminSessions)
    .values({ adminId: admin.id, ip: input.ip, agent: input.agent?.slice(0, 200) ?? null, expiresAt })
    .returning();

  await db.update(platformAdmins).set({ lastLoginAt: new Date() }).where(eq(platformAdmins.id, admin.id));

  const jar = await cookies();
  jar.set(ADMIN_COOKIE, await sign({ aid: admin.id, sid: session.id }), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: SESSION_HOURS * 3600,
  });

  await logSecurity({
    event: 'admin.login.success',
    phone: verified.challenge.phone,
    ip: input.ip,
    agent: input.agent,
    accountId: admin.accountId,
    data: { adminId: admin.id, role: admin.role },
  });

  return { ok: true };
}

/* ----------------------------- сессия ----------------------------- */

export type AdminContext = {
  admin: PlatformAdmin;
  role: AdminRole;
  sessionId: string;
  phone: string;
};

async function adminById(id: string): Promise<PlatformAdmin | undefined> {
  const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.id, id));
  return row;
}

async function adminByAccount(accountId: string): Promise<PlatformAdmin | undefined> {
  const [row] = await db.select().from(platformAdmins).where(eq(platformAdmins.accountId, accountId));
  return row;
}

/**
 * Кто сейчас в админке: cookie → живая сессия → активный админ.
 *
 * Простой считается по `last_seen_at`: два часа без запросов закрывают
 * сессию, даже если cookie ещё не истекла. Отметка времени пишется не
 * чаще раза в две минуты, чтобы каждая страница не обновляла строку.
 */
export async function getAdmin(): Promise<AdminContext | null> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const claims = token ? await read(token) : null;
  if (!claims) return null;

  const [row] = await db
    .select({
      session: adminSessions,
      admin: platformAdmins,
      phone: accounts.phone,
      blockedAt: accounts.blockedAt,
    })
    .from(adminSessions)
    .innerJoin(platformAdmins, eq(platformAdmins.id, adminSessions.adminId))
    .innerJoin(accounts, eq(accounts.id, platformAdmins.accountId))
    .where(and(eq(adminSessions.id, claims.sid), eq(adminSessions.adminId, claims.aid)));

  if (!row) return null;
  const now = Date.now();
  if (row.session.revokedAt || row.session.expiresAt.getTime() < now) return null;
  if (row.session.lastSeenAt.getTime() < now - IDLE_MINUTES * 60_000) return null;
  if (!row.admin.active || row.blockedAt) return null;

  if (row.session.lastSeenAt.getTime() < now - TOUCH_MINUTES * 60_000) {
    await db.update(adminSessions).set({ lastSeenAt: new Date() }).where(eq(adminSessions.id, row.session.id));
  }

  return { admin: row.admin, role: asAdminRole(row.admin.role), sessionId: row.session.id, phone: row.phone };
}

/**
 * Единственный способ попасть в защищённый код админки.
 *
 * Без сессии уводит на вход; с сессией, но без нужной роли, на
 * страницу «нет прав» и пишет в журнал безопасности: попытка сделать
 * то, на что прав нет, сама по себе событие.
 */
export async function requireAdmin(need: AdminRole = 'viewer'): Promise<AdminContext> {
  const ctx = await getAdmin();
  if (!ctx) redirect('/admin/login');
  if (!roleAtLeast(ctx.role, need)) {
    await logSecurity({
      event: 'admin.denied',
      accountId: ctx.admin.accountId,
      data: { adminId: ctx.admin.id, role: ctx.role, need },
    });
    redirect('/admin/forbidden');
  }
  return ctx;
}

export async function adminSignOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(ADMIN_COOKIE)?.value;
  const claims = token ? await read(token) : null;
  jar.delete({ name: ADMIN_COOKIE, path: '/admin' });
  if (claims) {
    await db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(adminSessions.id, claims.sid), isNull(adminSessions.revokedAt)));
    await logSecurity({ event: 'admin.logout', data: { adminId: claims.aid } });
  }
}

/** Погасить одну сессию админки (свою или чужую владельцем платформы). */
export async function revokeAdminSession(sessionId: string, by: AdminContext): Promise<void> {
  await db
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));
  await logSecurity({
    event: 'admin.session.revoked',
    accountId: by.admin.accountId,
    data: { adminId: by.admin.id, sessionId },
  });
}

export async function listAdminSessions(adminId: string) {
  return db
    .select()
    .from(adminSessions)
    .where(and(eq(adminSessions.adminId, adminId), isNull(adminSessions.revokedAt), gt(adminSessions.expiresAt, new Date())))
    .orderBy(desc(adminSessions.lastSeenAt));
}

/* ----------------------------- журнал ----------------------------- */

export type AdminAction =
  | 'subscription.extend'
  | 'tenant.block'
  | 'tenant.unblock'
  | 'tenant.note'
  | 'tenant.view'
  | 'account.block'
  | 'account.unblock'
  | 'account.logout_all'
  | 'account.reset_access'
  | 'account.view'
  | 'admin.add'
  | 'admin.role'
  | 'admin.deactivate'
  | 'admin.session_revoke';

/**
 * След действия админа. Пишется всегда, и всегда с причиной там, где
 * действие опасное: «кто и почему» отвечает на вопрос через год.
 */
export async function logAdminAction(input: {
  by: AdminContext;
  action: AdminAction;
  targetType?: 'tenant' | 'account' | 'admin' | 'session';
  targetId?: string | null;
  targetLabel?: string | null;
  reason?: string | null;
  data?: Record<string, unknown>;
}): Promise<boolean> {
  /* Просмотр пишется раз в полчаса на цель: иначе журнал состоял бы из
     сотни «открыл» подряд после каждого обновления страницы, и найти в
     нём продление стало бы невозможно. */
  if ((input.action === 'tenant.view' || input.action === 'account.view') && input.targetId) {
    const since = new Date(Date.now() - 30 * 60_000);
    const [recent] = await db
      .select({ id: adminAudit.id })
      .from(adminAudit)
      .where(
        and(
          eq(adminAudit.adminId, input.by.admin.id),
          eq(adminAudit.action, input.action),
          eq(adminAudit.targetId, input.targetId),
          gt(adminAudit.createdAt, since),
        ),
      )
      .limit(1);
    if (recent) return false;
  }

  const ip = clientIp(await headers());
  await db.insert(adminAudit).values({
    adminId: input.by.admin.id,
    adminName: input.by.admin.name,
    action: input.action,
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel?.slice(0, 120) ?? null,
    reason: input.reason?.trim().slice(0, 500) || null,
    data: input.data ?? null,
    ip,
  });
  if (input.action !== 'tenant.view' && input.action !== 'account.view') {
    await logSecurity({
      event: 'admin.action',
      accountId: input.by.admin.accountId,
      ip,
      data: { adminId: input.by.admin.id, action: input.action, target: input.targetId ?? undefined },
    });
  }
  return true;
}
