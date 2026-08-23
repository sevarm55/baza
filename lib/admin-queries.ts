import { and, desc, eq, gt, gte, ilike, inArray, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from './db';
import {
  accounts,
  adminAudit,
  audit,
  clients,
  loginAttempts,
  orders,
  platformPayments,
  securityEvents,
  sessions,
  tenants,
  users,
} from './db/schema';
import { listTenantsForAdmin, type AdminTenant } from './queries';
import { accessOf, type Access } from './subscription';
import { deviceLabel } from './security-log';
import { normalizePhone } from './phone';

/**
 * Запросы админки: единственное место, где чтение не ограничено одним
 * бизнесом. Вызывать только после `requireAdmin()`.
 *
 * Бизнесов десятки, людей сотни: фильтры и сортировки делаются в
 * памяти после одного запроса, так проще проверять. Когда счёт пойдёт
 * на тысячи, сюда придёт пагинация, а не другой подход.
 */

const DAY = 86_400_000;

/* ----------------------------- обзор ----------------------------- */

export type PlatformStats = {
  businesses: number;
  byState: Record<Access['state'], number>;
  activeWeek: number;
  people: number;
  carsToday: number;
  carsWeek: number;
  everPaid: number;
  everTrial: number;
  churned: number;
  signups: { week: string; count: number }[];
  carsByDay: { day: string; count: number }[];
};

export async function platformStats(now = new Date()): Promise<PlatformStats> {
  const list = await listTenantsForAdmin();
  const byState: Record<Access['state'], number> = { active: 0, trial: 0, expired: 0, blocked: 0, unpaid: 0 };
  for (const t of list) byState[accessOf(t, now).state] += 1;

  const weekAgo = new Date(now.getTime() - 7 * DAY);
  const dayAgo = new Date(now.getTime() - DAY);
  const twelveWeeks = new Date(now.getTime() - 12 * 7 * DAY);
  const fourteenDays = new Date(now.getTime() - 14 * DAY);

  const [[people], [cars], signups, carsByDay] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(accounts),
    db
      .select({
        today: sql<number>`count(*) filter (where ${orders.createdAt} > ${dayAgo.toISOString()}::timestamptz)::int`,
        week: sql<number>`count(*) filter (where ${orders.createdAt} > ${weekAgo.toISOString()}::timestamptz)::int`,
      })
      .from(orders)
      .where(and(isNull(orders.canceledAt), gt(orders.createdAt, weekAgo))),
    db
      .select({
        week: sql<string>`to_char(date_trunc('week', ${tenants.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(tenants)
      .where(gt(tenants.createdAt, twelveWeeks))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${orders.createdAt}), 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      })
      .from(orders)
      .where(and(isNull(orders.canceledAt), gt(orders.createdAt, fourteenDays)))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
  ]);

  const everPaid = list.filter((t) => t.paidUntil !== null).length;
  const everTrial = list.filter((t) => t.trialEndsAt !== null).length;
  const churned = list.filter((t) => t.paidUntil !== null && accessOf(t, now).state === 'expired').length;

  return {
    businesses: list.length,
    byState,
    activeWeek: list.filter((t) => t.lastOrderAt && t.lastOrderAt > weekAgo).length,
    people: people?.n ?? 0,
    carsToday: cars?.today ?? 0,
    carsWeek: cars?.week ?? 0,
    everPaid,
    everTrial,
    churned,
    signups,
    carsByDay,
  };
}

/** Кому звонить: истекает, просрочено, тишина на триале. */
export function attentionList(list: AdminTenant[], now = new Date()) {
  return list
    .map((t) => ({ t, access: accessOf(t, now) }))
    .filter(({ t, access }) => {
      if (access.state === 'expired') return true;
      if (access.canRead && access.daysLeft <= 3 && access.state !== 'blocked') return true;
      if (access.state === 'trial' && (t.idleDays === null || t.idleDays >= 2)) return true;
      return false;
    })
    .sort((a, b) => a.access.daysLeft - b.access.daysLeft);
}

/* ---------------------------- бизнесы ---------------------------- */

export type BusinessSort = 'created' | 'revenue' | 'activity' | 'expiry';
export type BusinessFilter = Access['state'] | 'all' | 'attention';

export async function listBusinesses(opts: { q?: string; state?: BusinessFilter; sort?: BusinessSort } = {}) {
  const list = await listTenantsForAdmin();
  const now = new Date();
  const attention = new Set(attentionList(list, now).map((x) => x.t.id));
  const q = (opts.q ?? '').trim().toLowerCase();
  const qPhone = q ? normalizePhone(q) : '';

  let rows = list.map((t) => ({ ...t, access: accessOf(t, now) }));
  if (q) {
    rows = rows.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.ownerName ?? '').toLowerCase().includes(q) ||
        (qPhone.length > 5 && (t.ownerPhone ?? '').includes(qPhone)) ||
        (t.ownerPhone ?? '').includes(q.replace(/\s+/g, '')),
    );
  }
  if (opts.state && opts.state !== 'all') {
    rows =
      opts.state === 'attention'
        ? rows.filter((t) => attention.has(t.id))
        : rows.filter((t) => t.access.state === opts.state);
  }
  const sort = opts.sort ?? 'created';
  rows.sort((a, b) => {
    if (sort === 'revenue') return b.revenue - a.revenue;
    if (sort === 'activity') return (b.lastOrderAt?.getTime() ?? 0) - (a.lastOrderAt?.getTime() ?? 0);
    if (sort === 'expiry') return a.access.daysLeft - b.access.daysLeft;
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  /* Сколько филиалов у владельца каждой точки: одна мойка или сеть. */
  const pointsByOwner = new Map<string, number>();
  for (const t of list) if (t.ownerAccountId) pointsByOwner.set(t.ownerAccountId, (pointsByOwner.get(t.ownerAccountId) ?? 0) + 1);

  return rows.map((t) => ({ ...t, ownerPoints: t.ownerAccountId ? (pointsByOwner.get(t.ownerAccountId) ?? 1) : 1 }));
}

/** Последний платёж по каждому бизнесу: для списка подписок. */
export async function lastPayments(): Promise<Map<string, { at: Date; amount: number }>> {
  const rows = await db
    .select({
      tenantId: platformPayments.tenantId,
      at: sql<string>`max(${platformPayments.at})`,
      amount: sql<number>`(array_agg(${platformPayments.amount} order by ${platformPayments.at} desc))[1]`,
    })
    .from(platformPayments)
    .groupBy(platformPayments.tenantId);
  return new Map(rows.map((r) => [r.tenantId, { at: new Date(r.at), amount: Number(r.amount) }]));
}

/* ------------------------------ люди ------------------------------ */

export type AccountRow = {
  id: string;
  phone: string;
  verified: boolean;
  blockedAt: Date | null;
  createdAt: Date;
  lastSeenAt: Date | null;
  hasPin: boolean;
  /** имена по участиям: «Давид», «Давид Петросян» */
  names: string[];
  memberships: { tenantId: string; tenantName: string; role: string; active: boolean; name: string }[];
};

export type AccountFilter = 'all' | 'owners' | 'staff' | 'blocked';

export async function listAccounts(opts: { q?: string; filter?: AccountFilter } = {}): Promise<AccountRow[]> {
  const [people, memberships, seen] = await Promise.all([
    db.select().from(accounts).orderBy(desc(accounts.createdAt)),
    db
      .select({
        accountId: users.accountId,
        tenantId: users.tenantId,
        tenantName: tenants.name,
        role: users.role,
        active: users.active,
        name: users.name,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(isNotNull(users.accountId)),
    db
      .select({
        accountId: users.accountId,
        last: sql<string | null>`max(${sessions.lastSeenAt})`,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(isNull(sessions.revokedAt))
      .groupBy(users.accountId),
  ]);

  const byAccount = new Map<string, AccountRow['memberships']>();
  for (const m of memberships) {
    if (!m.accountId) continue;
    const list = byAccount.get(m.accountId) ?? [];
    list.push({ tenantId: m.tenantId, tenantName: m.tenantName, role: m.role, active: m.active, name: m.name });
    byAccount.set(m.accountId, list);
  }
  const seenBy = new Map(seen.map((s) => [s.accountId, s.last ? new Date(s.last) : null]));

  const q = (opts.q ?? '').trim().toLowerCase();
  const qPhone = q ? normalizePhone(q) : '';

  let rows: AccountRow[] = people.map((a) => {
    const ms = byAccount.get(a.id) ?? [];
    return {
      id: a.id,
      phone: a.phone,
      verified: a.phoneVerifiedAt !== null,
      blockedAt: a.blockedAt,
      createdAt: a.createdAt,
      lastSeenAt: seenBy.get(a.id) ?? null,
      hasPin: a.pinHash !== 'none' && a.pinHash.length > 0,
      names: [...new Set(ms.map((m) => m.name))],
      memberships: ms,
    };
  });

  if (q) {
    rows = rows.filter(
      (r) =>
        (qPhone.length > 5 && r.phone.includes(qPhone)) ||
        r.phone.includes(q.replace(/\s+/g, '')) ||
        r.names.some((n) => n.toLowerCase().includes(q)),
    );
  }
  if (opts.filter === 'owners') rows = rows.filter((r) => r.memberships.some((m) => m.role === 'owner' && m.active));
  if (opts.filter === 'staff') rows = rows.filter((r) => r.memberships.some((m) => m.role === 'staff' && m.active));
  if (opts.filter === 'blocked') rows = rows.filter((r) => r.blockedAt !== null);

  return rows;
}

export async function accountDetail(id: string) {
  const [account] = await db.select().from(accounts).where(eq(accounts.id, id));
  if (!account) return null;

  const [memberships, sess, events, actions, [fails]] = await Promise.all([
    db
      .select({
        id: users.id,
        tenantId: users.tenantId,
        tenantName: tenants.name,
        tenantPlan: tenants.plan,
        trialEndsAt: tenants.trialEndsAt,
        paidUntil: tenants.paidUntil,
        role: users.role,
        active: users.active,
        name: users.name,
        percent: users.percent,
        lastUsedAt: users.lastUsedAt,
        createdAt: users.createdAt,
      })
      .from(users)
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(eq(users.accountId, id))
      .orderBy(desc(users.createdAt)),
    db
      .select({
        id: sessions.id,
        kind: sessions.kind,
        device: sessions.device,
        tenantName: tenants.name,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(tenants, eq(tenants.id, users.tenantId))
      .where(and(eq(users.accountId, id), isNull(sessions.revokedAt)))
      .orderBy(desc(sessions.lastSeenAt))
      .limit(30),
    db
      .select()
      .from(securityEvents)
      .where(or(eq(securityEvents.accountId, id), eq(securityEvents.phone, account.phone)))
      .orderBy(desc(securityEvents.at))
      .limit(60),
    db
      .select()
      .from(adminAudit)
      .where(and(eq(adminAudit.targetType, 'account'), eq(adminAudit.targetId, id)))
      .orderBy(desc(adminAudit.createdAt))
      .limit(30),
    db
      .select({ n: sql<number>`count(*)::int` })
      .from(loginAttempts)
      .where(and(eq(loginAttempts.phone, account.phone), eq(loginAttempts.ok, false), gt(loginAttempts.at, new Date(Date.now() - DAY)))),
  ]);

  return {
    account,
    memberships: memberships.map((m) => ({ ...m, access: accessOf({ plan: m.tenantPlan, trialEndsAt: m.trialEndsAt, paidUntil: m.paidUntil }) })),
    sessions: sess.map((s) => ({ ...s, label: deviceLabel(s.device) ?? s.device })),
    events,
    actions,
    failedLogins: fails?.n ?? 0,
  };
}

export async function accountByPhoneExact(phone: string) {
  const [row] = await db.select().from(accounts).where(eq(accounts.phone, phone));
  return row ?? null;
}

/* ----------------------------- журнал ----------------------------- */

export async function listAdminAudit(opts: { action?: string; limit?: number; before?: Date } = {}) {
  return db
    .select()
    .from(adminAudit)
    .where(
      and(
        opts.action ? eq(adminAudit.action, opts.action) : undefined,
        opts.before ? lt(adminAudit.createdAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(adminAudit.createdAt))
    .limit(Math.min(opts.limit ?? 100, 500));
}

/** Старый журнал админки (таблица audit) за время до переезда. */
export async function listLegacyAdminAudit(limit = 200) {
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
    .where(inArray(audit.action, ['tenant_view', 'subscription_extend', 'tenant_block', 'tenant_unblock', 'tenant_note']))
    .orderBy(desc(audit.createdAt))
    .limit(limit);
}

export async function tenantAdminAudit(tenantId: string, limit = 50) {
  const [fresh, legacy] = await Promise.all([
    db
      .select()
      .from(adminAudit)
      .where(and(eq(adminAudit.targetType, 'tenant'), eq(adminAudit.targetId, tenantId)))
      .orderBy(desc(adminAudit.createdAt))
      .limit(limit),
    db
      .select({ id: audit.id, action: audit.action, data: audit.data, at: audit.createdAt, adminName: users.name })
      .from(audit)
      .leftJoin(users, eq(users.id, audit.userId))
      .where(
        and(
          eq(audit.tenantId, tenantId),
          inArray(audit.action, ['tenant_view', 'subscription_extend', 'tenant_block', 'tenant_unblock', 'tenant_note']),
        ),
      )
      .orderBy(desc(audit.createdAt))
      .limit(limit),
  ]);
  return [
    ...fresh.map((f) => ({ id: f.id, action: f.action, adminName: f.adminName, reason: f.reason, data: f.data, at: f.createdAt })),
    ...legacy.map((l) => ({ id: l.id, action: l.action, adminName: l.adminName, reason: null, data: l.data as Record<string, unknown> | null, at: l.at })),
  ]
    .sort((a, b) => b.at.getTime() - a.at.getTime())
    .slice(0, limit);
}

export async function listSecurityEvents(opts: { level?: string; event?: string; limit?: number; before?: Date } = {}) {
  return db
    .select({
      id: securityEvents.id,
      event: securityEvents.event,
      level: securityEvents.level,
      phone: securityEvents.phone,
      accountId: securityEvents.accountId,
      tenantId: securityEvents.tenantId,
      tenantName: tenants.name,
      ip: securityEvents.ip,
      agent: securityEvents.agent,
      data: securityEvents.data,
      at: securityEvents.at,
    })
    .from(securityEvents)
    .leftJoin(tenants, eq(tenants.id, securityEvents.tenantId))
    .where(
      and(
        opts.level && opts.level !== 'all' ? eq(securityEvents.level, opts.level) : undefined,
        opts.event ? ilike(securityEvents.event, `${opts.event}%`) : undefined,
        opts.before ? lt(securityEvents.at, opts.before) : undefined,
      ),
    )
    .orderBy(desc(securityEvents.at))
    .limit(Math.min(opts.limit ?? 100, 500));
}

/** Какие события встречались: для фильтра. */
export async function securityEventKinds(): Promise<string[]> {
  const rows = await db
    .select({ event: securityEvents.event })
    .from(securityEvents)
    .where(gte(securityEvents.at, new Date(Date.now() - 90 * DAY)))
    .groupBy(securityEvents.event)
    .orderBy(securityEvents.event);
  return rows.map((r) => r.event);
}

/* --------------------------- поддержка --------------------------- */

export async function supportSearch(raw: string) {
  const q = raw.trim();
  if (!q) return { people: [], businesses: [], clients: [] };

  const phone = normalizePhone(q);
  const looksPhone = /^[+\d\s()-]{6,}$/.test(q) && phone.length >= 8;
  const compact = q.replace(/[\s-]/g, '').toUpperCase();
  const looksPlate = /^[A-ZА-ЯԱ-Ֆ0-9]{4,10}$/i.test(compact) && /\d/.test(compact) && !looksPhone;

  const [people, businesses, washClients] = await Promise.all([
    looksPhone
      ? listAccounts({ q: phone })
      : q.length >= 2
        ? listAccounts({ q })
        : Promise.resolve([]),
    looksPhone ? listBusinesses({ q: phone }) : listBusinesses({ q }),
    looksPlate
      ? db
          .select({
            id: clients.id,
            key: clients.key,
            visits: clients.visits,
            total: clients.total,
            lastSeenAt: clients.lastSeenAt,
            tenantId: clients.tenantId,
            tenantName: tenants.name,
          })
          .from(clients)
          .innerJoin(tenants, eq(tenants.id, clients.tenantId))
          .where(ilike(clients.key, `%${compact}%`))
          .orderBy(desc(clients.lastSeenAt))
          .limit(20)
      : Promise.resolve([]),
  ]);

  return { people: people.slice(0, 20), businesses: businesses.slice(0, 20), clients: washClients };
}
