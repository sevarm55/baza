'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { refresh, revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { tenants, users } from '@/lib/db/schema';
import { findClient, getTenant, startOfDay } from '@/lib/queries';
import { toMinor } from '@/lib/money';
import { settleStaff } from '@/lib/payroll';
import { addExpense, editExpense, removeExpense } from '@/lib/expenses';
import * as catalog from '@/lib/catalog';
import { listActivePasses, sellPass } from '@/lib/passes';
import { passesEnabled } from '@/lib/features';
import { currentAccess, SubscriptionExpiredError } from '@/lib/subscription';
import { createBusiness, PhoneTakenError } from '@/lib/tenant';
import { createOrder, cancelOrder, type Payment } from '@/lib/orders';
import { canRecord, closeShift, openShift } from '@/lib/shifts';
import {
  endSession,
  requireOwner,
  requireSession,
  startSession,
  verifyPin,
} from '@/lib/auth';
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

  try {
    await catalog.addStaff({ tenantId: session.tid, name, phone, pin, percent });
  } catch (e) {
    if (e instanceof catalog.ValidationError && e.message === 'PHONE_TAKEN') {
      return { error: hy.auth.phoneTaken };
    }
    return { error: hy.errors.required };
  }

  revalidatePath('/owner/staff');
  return { ok: true };
}

/** Не удаляем: у сотрудника есть история записей и зарплат. */
export async function deactivateStaff(staffId: string): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  await catalog.deactivateStaff({
    tenantId: session.tid,
    id: staffId,
    actorId: session.uid,
  });

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

  try {
    /* Цены по классам отсюда не передаются — и это не упущение.
       В кабинете формы под них нет, а `undefined` означает «не трогать»:
       правка названия или базовой цены из браузера не должна стирать
       прайс по классам, выставленный с телефона. */
    await catalog.upsertService({ tenantId: session.tid, id: id || undefined, name, price });
  } catch {
    return { error: hy.errors.required };
  }

  revalidatePath('/owner/settings');
  return { ok: true };
}

/** Не удаляем: на услугу ссылаются прошлые записи. */
export async function archiveService(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  await catalog.archiveService({ tenantId: session.tid, id }).catch(() => {});

  revalidatePath('/owner/settings');
}

export async function saveStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const percent = Number(formData.get('percent') ?? 0);

  try {
    await catalog.saveStaff({ tenantId: session.tid, id, name, percent });
  } catch {
    return { error: hy.errors.badPercent };
  }

  revalidatePath('/owner/staff');
  return { ok: true };
}

export async function archiveStaff(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  // владелец не должен отключить сам себя и потерять доступ к кабинету —
  // проверка внутри catalog, здесь просто гасим отказ
  await catalog
    .deactivateStaff({ tenantId: session.tid, id, actorId: session.uid })
    .catch(() => {});

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

  // то же правило, что и в приложении: вне смены записывать нельзя
  const tenantForShift = await getTenant(session.tid);
  if (!tenantForShift) throw new Error('NOT_FOUND');
  if (!(await canRecord(session.tid, session.uid, startOfDay(tenantForShift.timezone)))) {
    throw new Error('SHIFT_REQUIRED');
  }

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

/* ------------------------------------------------------------------ *
 * Расходы
 *
 * Выручка отвечала на вопрос «сколько намыли», а владелец спрашивает
 * «сколько осталось». Здесь появляется вторая половина ответа.
 * ------------------------------------------------------------------ */

export async function addExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: hy.errors.generic };

  const amount = toMinor(Number(formData.get('amount') ?? 0), tenant.currency);
  const category = String(formData.get('category') ?? '').trim();
  const monthly = formData.get('monthly') === 'on';

  try {
    await addExpense({
      tenantId: session.tid,
      userId: session.uid,
      amount,
      category,
      monthly,
      /* Постоянный расход считаем с начала сегодняшнего дня, а не с
         минуты, когда его завели: иначе аренда, добавленная в обед,
         принесёт в прибыль за сегодня половину дневной доли, и цифра
         разойдётся с завтрашней без всякой причины. */
      at: monthly ? startOfDay(tenant.timezone) : undefined,
    });
  } catch {
    return { error: hy.errors.required };
  }

  revalidatePath('/owner/expenses');
  // прибыль на главной считается из расходов и должна поменяться сразу
  revalidatePath('/owner');
  return { ok: true };
}

export async function removeExpenseAction(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return;

  await removeExpense(
    session.tid,
    String(formData.get('id') ?? ''),
    startOfDay(tenant.timezone),
  );

  revalidatePath('/owner/expenses');
  revalidatePath('/owner');
}

/**
 * Изменить расход.
 *
 * Сумму постоянного расхода правка не переписывает: старый закрывается,
 * новый начинается с сегодняшнего дня — причина в lib/expenses.ts.
 */
export async function saveExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: hy.errors.generic };

  try {
    const row = await editExpense({
      tenantId: session.tid,
      id: String(formData.get('id') ?? ''),
      userId: session.uid,
      amount: toMinor(Number(formData.get('amount') ?? 0), tenant.currency),
      category: String(formData.get('category') ?? ''),
      note: null,
      dayStart: startOfDay(tenant.timezone),
    });
    if (!row) return { error: hy.errors.generic };
  } catch {
    return { error: hy.errors.required };
  }

  revalidatePath('/owner/expenses');
  revalidatePath('/owner');
  return { ok: true };
}


/**
 * Встать на смену и уйти с неё — из веба.
 *
 * До сих пор смена жила только в приложении, и на вебе сотрудник
 * записывал машины вообще вне её. С правилом «вне смены не записываешь»
 * это оставило бы веб-версию неработоспособной, а дыру со сдачей
 * наличных — открытой ровно там, где на неё никто не смотрит.
 *
 * Сдаваемую сумму здесь не спрашиваем: на телефоне для этого есть лист
 * с подтверждением, а в вебе городить его ради второго по важности
 * клиента незачем. Владелец увидит «не отмечено» — это честнее нуля.
 */
export async function toggleShiftAction(formData: FormData): Promise<void> {
  const session = await requireSession();
  await ensureDb();
  await requireWriteAccess(session.tid);

  const tenant = await getTenant(session.tid);
  if (!tenant) return;

  if (String(formData.get('open')) === 'true') {
    await openShift(session.tid, session.uid, startOfDay(tenant.timezone));
  } else {
    await closeShift(session.tid, session.uid);
  }

  revalidatePath('/work');
  revalidatePath('/owner');
}
