'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { refresh, revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { services, tenants, users } from '@/lib/db/schema';
import { findClient, getTenant, listServices } from '@/lib/queries';
import { toMinor } from '@/lib/money';
import { settleStaff } from '@/lib/payroll';
import { listActivePasses, sellPass } from '@/lib/passes';
import { passesEnabled } from '@/lib/features';
import { currentAccess, SubscriptionExpiredError } from '@/lib/subscription';
import { createBusiness, PhoneTakenError } from '@/lib/tenant';
import { createOrder, cancelOrder, type Payment } from '@/lib/orders';
import {
  endSession,
  requireOwner,
  requireSession,
  startSession,
  verifyPin,
} from '@/lib/auth';
import { hashPin } from '@/lib/pin';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { isValidPhone, isValidPin, normalizePhone } from '@/lib/phone';
import { isNicheAvailable, type NicheKey } from '@/lib/niches';
import { hy } from '@/lib/i18n/hy';

/**
 * Успех помечен явным `ok`, а не отсутствием ошибки.
 *
 * Начальное состояние useActionState тоже null, и если действие вернёт
 * null при успехе, React не увидит изменения — эффект очистки формы
 * просто не сработает, и владелец отправит те же данные второй раз.
 */
export type FormState = { error?: string; ok?: true } | null;

/* ------------------------------------------------------------------ *
 * Каждое действие само проверяет сессию и права.
 * Server Action — это открытый POST-эндпоинт, а не «внутренняя функция».
 * ------------------------------------------------------------------ */

export async function registerBusiness(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  await ensureDb();

  const niche = String(formData.get('niche') ?? '');
  const businessName = String(formData.get('businessName') ?? '').trim();
  const ownerName = String(formData.get('ownerName') ?? '').trim();
  const phone = String(formData.get('phone') ?? '');
  const pin = String(formData.get('pin') ?? '');

  // действие открыто наружу, поэтому нишу проверяем здесь, а не только в UI
  if (!isNicheAvailable(niche)) return { error: hy.errors.generic };
  if (businessName.length < 2 || ownerName.length < 2) return { error: hy.errors.required };
  if (!isValidPhone(phone)) return { error: hy.errors.badPhone };
  if (!isValidPin(pin)) return { error: hy.errors.badPin };

  try {
    const { tenant, owner } = await createBusiness({
      niche: niche as NicheKey,
      businessName,
      ownerName,
      phone,
      pin,
    });
    await startSession({ uid: owner.id, tid: tenant.id, role: 'owner' });
  } catch (e) {
    if (e instanceof PhoneTakenError) return { error: hy.auth.phoneTaken };
    throw e;
  }

  redirect('/owner');
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  await ensureDb();

  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const pin = String(formData.get('pin') ?? '');
  const ip = clientIp(await headers());

  /* Счётчик спрашивается ДО сверки: смысл в том, чтобы при переборе не
     выполнялся ни дорогой scrypt, ни сама проверка. */
  const guard = await checkLogin(phone, ip);
  if (!guard.allowed) {
    return { error: hy.auth.tooManyTries(Math.ceil(guard.retryAfter / 60)) };
  }

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.phone, phone), eq(users.active, true)));

  // одна и та же ошибка на неверный телефон и на неверный PIN —
  // иначе форма превращается в способ узнать, кто зарегистрирован
  const ok = user ? await verifyPin(pin, user.pinHash) : false;
  await noteLogin(phone, ip, ok);
  if (!user || !ok) return { error: hy.auth.wrongCredentials };

  await startSession(
    {
      uid: user.id,
      tid: user.tenantId,
      role: user.role === 'owner' ? 'owner' : 'staff',
    },
    { kind: 'web' },
  );

  redirect(user.role === 'owner' ? '/owner' : '/work');
}

export async function signOut() {
  await endSession();
  redirect('/login');
}

/* -------------------------- сотрудники -------------------------- */

export async function addStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const name = String(formData.get('name') ?? '').trim();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const pin = String(formData.get('pin') ?? '');
  const percent = Number(formData.get('percent') ?? 0);

  if (name.length < 2) return { error: hy.errors.required };
  if (!isValidPhone(phone)) return { error: hy.errors.badPhone };
  if (!isValidPin(pin)) return { error: hy.errors.badPin };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: hy.errors.badPercent };
  }

  const taken = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (taken.length) return { error: hy.auth.phoneTaken };

  await db.insert(users).values({
    tenantId: session.tid,
    phone,
    pinHash: await hashPin(pin),
    name,
    role: 'staff',
    percent,
  });

  revalidatePath('/owner/staff');
  return { ok: true };
}

/** Не удаляем: у сотрудника есть история записей и зарплат. */
export async function deactivateStaff(staffId: string): Promise<void> {
  const session = await requireOwner();
  await ensureDb();
  if (staffId === session.uid) throw new Error('CANNOT_DEACTIVATE_SELF');

  await db
    .update(users)
    .set({ active: false })
    .where(and(eq(users.id, staffId), eq(users.tenantId, session.tid)));

  revalidatePath('/owner/staff');
}

/**
 * Проверка подписки перед любой записью новой работы.
 *
 * Блокируем только запись. Чтение, отчёты и выгрузка остаются открытыми:
 * данные принадлежат бизнесу, а не нам.
 */
async function requireWriteAccess(tenantId: string) {
  const tenant = await getTenant(tenantId);
  if (!tenant) throw new Error('NO_TENANT');
  if (!currentAccess(tenant).canWrite) throw new SubscriptionExpiredError();
  return tenant;
}

/* -------------------------- услуги и цены ------------------------ *
 * Правка цены НЕ трогает прошлые записи: в каждом заказе лежит снимок.
 * Поэтому владелец может спокойно менять прайс хоть каждый день —
 * вчерашняя выручка и зарплаты останутся прежними.
 * ----------------------------------------------------------------- */

export async function saveService(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: hy.errors.generic };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const price = toMinor(Number(formData.get('price') ?? 0), tenant.currency);

  if (name.length < 1) return { error: hy.errors.required };
  if (!Number.isFinite(price) || price < 0) return { error: hy.errors.required };

  if (id) {
    await db
      .update(services)
      .set({ name, price })
      .where(and(eq(services.id, id), eq(services.tenantId, session.tid)));
  } else {
    const existing = await listServices(session.tid);
    await db.insert(services).values({
      tenantId: session.tid,
      name,
      price,
      sort: existing.length,
    });
  }

  revalidatePath('/owner/settings');
  return { ok: true };
}

/** Не удаляем: на услугу ссылаются прошлые записи. */
export async function archiveService(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  await db
    .update(services)
    .set({ active: false })
    .where(and(eq(services.id, id), eq(services.tenantId, session.tid)));

  revalidatePath('/owner/settings');
}

export async function saveStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const percent = Number(formData.get('percent') ?? 0);

  if (name.length < 2) return { error: hy.errors.required };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: hy.errors.badPercent };
  }

  await db
    .update(users)
    .set({ name, percent })
    .where(and(eq(users.id, id), eq(users.tenantId, session.tid)));

  revalidatePath('/owner/staff');
  return { ok: true };
}

export async function archiveStaff(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  // владелец не должен отключить сам себя и потерять доступ к кабинету
  if (id === session.uid) return;

  await db
    .update(users)
    .set({ active: false })
    .where(and(eq(users.id, id), eq(users.tenantId, session.tid)));

  revalidatePath('/owner/staff');
}

export async function saveBusiness(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const name = String(formData.get('name') ?? '').trim();
  if (name.length < 2) return;

  await db.update(tenants).set({ name }).where(eq(tenants.id, session.tid));
  revalidatePath('/owner');
}

/* --------------------------- зарплаты --------------------------- */

/**
 * Отметить расчёт с сотрудником.
 *
 * Сумма считается на сервере заново и НЕ приходит от клиента — иначе
 * подделанный запрос запишет в историю выплат что угодно.
 *
 * Верхняя граница `until` фиксируется до подсчёта: запись, созданная
 * в этот же момент, попадёт в следующий расчёт, а не потеряется между
 * посчитанной суммой и отметкой о выплате.
 */
export async function markPaid(staffId: string): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  await settleStaff({ tenantId: session.tid, staffId, byUserId: session.uid });

  revalidatePath('/owner/payroll');
}

/* ---------------------------- записи ---------------------------- */

export async function addOrder(input: {
  clientKey: string;
  serviceId: string;
  payment: Payment;
  passId?: string;
  /** ref из офлайн-очереди: повторная досылка не создаст вторую запись */
  clientRef?: string;
}): Promise<void> {
  const session = await requireSession();
  await ensureDb();
  await requireWriteAccess(session.tid);

  const allowed = passesEnabled()
    ? ['cash', 'card', 'transfer', 'pass']
    : ['cash', 'card', 'transfer'];
  if (!allowed.includes(input.payment)) throw new Error('BAD_PAYMENT');

  await createOrder({
    tenantId: session.tid,
    staffId: session.uid,
    serviceId: input.serviceId,
    clientKey: input.clientKey,
    payment: input.payment,
    passId: input.passId,
    clientRef: input.clientRef,
  });

  // счётчик смены должен обновиться сразу — сотрудник на него смотрит
  refresh();
}

/**
 * Подсказка «этот клиент уже был» прямо во время набора номера.
 * Заодно отдаём активные абонементы — сотрудник должен увидеть
 * вариант «списать», а не брать деньги повторно.
 */
export async function lookupClient(key: string) {
  const session = await requireSession();
  if (key.trim().length < 3) return null;

  const client = await findClient(session.tid, key);
  if (!client) return null;

  const active = passesEnabled() ? await listActivePasses(session.tid, client.id) : [];

  return {
    visits: client.visits,
    total: client.total,
    lastSeenAt: client.lastSeenAt.toISOString(),
    passes: active.map((p) => ({
      id: p.id,
      serviceId: p.serviceId,
      serviceName: p.serviceName,
      remaining: p.totalUses - p.usedUses,
    })),
  };
}

/* -------------------------- абонементы -------------------------- */

export async function sellPassAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();
  if (!passesEnabled()) return { error: hy.errors.generic };

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: hy.errors.generic };
  if (!currentAccess(tenant).canWrite) return { error: hy.billing.expiredTitle };

  const clientKey = String(formData.get('clientKey') ?? '').trim();
  const serviceId = String(formData.get('serviceId') ?? '');
  const totalUses = Number(formData.get('totalUses') ?? 0);
  const price = toMinor(Number(formData.get('price') ?? 0), tenant.currency);
  const validDays = Number(formData.get('validDays') ?? 0);

  if (!clientKey || !serviceId) return { error: hy.errors.required };
  if (!Number.isInteger(totalUses) || totalUses < 1) return { error: hy.errors.required };
  if (!Number.isFinite(price) || price < 0) return { error: hy.errors.required };

  try {
    await sellPass({
      tenantId: session.tid,
      soldBy: session.uid,
      clientKey,
      serviceId,
      totalUses,
      price,
      validDays: Number.isFinite(validDays) && validDays > 0 ? validDays : undefined,
    });
  } catch {
    return { error: hy.errors.generic };
  }

  revalidatePath('/owner/passes');
  return { ok: true };
}

/**
 * Отмена ошибочной записи.
 *
 * Владелец может отменить любую, сотрудник — только свою. Иначе один
 * мойщик сможет вычистить выручку другого, и никто этого не заметит.
 * След остаётся в аудите в обоих случаях.
 */
export async function revokeOrder(orderId: string): Promise<void> {
  const session = await requireSession();
  await ensureDb();

  await cancelOrder({
    tenantId: session.tid,
    orderId,
    byUserId: session.uid,
    onlyOwnedBy: session.role === 'owner' ? undefined : session.uid,
  });

  refresh();
}
