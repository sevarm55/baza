import { and, desc, eq, gte, lt, sql } from 'drizzle-orm';
import { db } from './db';
import { platformPayments, tenants, users } from './db/schema';

/**
 * Наши деньги.
 *
 * Продукт наводит учёт у автомоек, а свой не вёл: продление меняло дату
 * окончания и не оставляло следа. Сколько заплатили, когда, кто платит
 * вовремя — всё это жило в голове и оттуда же исчезало.
 *
 * Сумма хранится отдельно от числа месяцев намеренно. Договариваются
 * по-разному: «три месяца за 40 000», «первый месяц бесплатно, дальше по
 * прайсу». Вычислять сумму из месяцев значило бы записывать не то, что
 * было, а то, что должно было быть.
 */

export type NewPayment = {
  tenantId: string;
  amount: number;
  months: number;
  note?: string | null;
  /** участие того, кто записал; пусто у админки платформы */
  byUserId: string | null;
};

export async function recordPayment(input: NewPayment) {
  const [row] = await db
    .insert(platformPayments)
    .values({
      tenantId: input.tenantId,
      amount: input.amount,
      months: input.months,
      note: input.note?.trim() || null,
      byUserId: input.byUserId,
    })
    .returning();

  return row;
}

/** Платежи одного бизнеса — свежие сверху. */
export async function paymentsOf(tenantId: string) {
  return db
    .select()
    .from(platformPayments)
    .where(eq(platformPayments.tenantId, tenantId))
    .orderBy(desc(platformPayments.at));
}

export type PaymentRow = {
  id: string;
  amount: number;
  months: number;
  note: string | null;
  at: Date;
  tenantId: string;
  tenantName: string;
  adminName: string | null;
};

/** Все платежи для отдельной страницы. */
export async function allPayments(limit = 200): Promise<PaymentRow[]> {
  return db
    .select({
      id: platformPayments.id,
      amount: platformPayments.amount,
      months: platformPayments.months,
      note: platformPayments.note,
      at: platformPayments.at,
      tenantId: platformPayments.tenantId,
      tenantName: tenants.name,
      adminName: users.name,
    })
    .from(platformPayments)
    .innerJoin(tenants, eq(tenants.id, platformPayments.tenantId))
    .leftJoin(users, eq(users.id, platformPayments.byUserId))
    .orderBy(desc(platformPayments.at))
    .limit(limit);
}

export type Totals = {
  /** получено за текущий календарный месяц */
  month: number;
  /** за прошлый — без него текущее число не с чем сравнить */
  prevMonth: number;
  /** за всё время */
  total: number;
  /** сколько платежей всего */
  count: number;
};

/**
 * Итоги.
 *
 * Месяц календарный, а не «последние тридцать дней»: подписки платят по
 * месяцам, и владелец платформы думает теми же месяцами, что и клиенты.
 */
export async function paymentTotals(now = new Date()): Promise<Totals> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));

  const sum = async (from?: Date, to?: Date) => {
    const where =
      from && to
        ? and(gte(platformPayments.at, from), lt(platformPayments.at, to))
        : from
          ? gte(platformPayments.at, from)
          : undefined;

    const [row] = await db
      .select({
        amount: sql<number>`coalesce(sum(${platformPayments.amount}), 0)::int`,
        count: sql<number>`count(*)::int`,
      })
      .from(platformPayments)
      .where(where);

    return { amount: row?.amount ?? 0, count: row?.count ?? 0 };
  };

  const [month, prev, all] = await Promise.all([
    sum(monthStart),
    sum(prevStart, monthStart),
    sum(),
  ]);

  return { month: month.amount, prevMonth: prev.amount, total: all.amount, count: all.count };
}

/**
 * Кому завтра кончается доступ.
 *
 * Шлётся владельцу платформы раз в день. Срок кончается в конкретный
 * день, и позвонить надо накануне: разговор «завтра отключится, продлеваем?»
 * идёт совсем иначе, чем «у вас всё отключилось».
 *
 * Возвращает число уведомлённых — чтобы задача в журнале писала, что
 * сработала, а не молчала.
 */
export async function remindExpiring(now = new Date()) {
  const { listTenantsForAdmin } = await import('./queries');
  const { accessOf } = await import('./subscription');
  const { notifyPlatform } = await import('./push');

  const soon = (await listTenantsForAdmin())
    .map((t) => ({ t, access: accessOf(t, now) }))
    .filter(({ access }) => access.canRead && access.daysLeft <= 1);

  if (soon.length === 0) return { notified: 0 };

  /* Имя владельца рядом с названием точки: у филиалов названия почти
     одинаковые — «Мойка» и «Мойка 2», — и по одному названию непонятно,
     кому звонить. */
  const names = soon
    .map(({ t }) => (t.ownerName ? `${t.name} (${t.ownerName})` : t.name))
    .join(', ');
  await notifyPlatform({
    title: soon.length === 1 ? 'Завтра кончается срок' : `Завтра кончается срок у ${soon.length}`,
    body: names.length > 140 ? names.slice(0, 137) + '…' : names,
    thread: 'platform',
  });

  return { notified: soon.length };
}
