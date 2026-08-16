'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { refresh, revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { alertSnoozes, clients, tenants, users } from '@/lib/db/schema';
import { getDict, getLocale } from '@/lib/i18n/server';
import { intlLocale } from '@/lib/i18n/format';
import {
  findClient,
  getClientHistory,
  getTenant,
  getUser,
  lastTierOf,
  startOfDay,
} from '@/lib/queries';
import { toMinor } from '@/lib/money';
import { dayMonth, hhmm, pastDay } from '@/lib/time';
import { settleMany } from '@/lib/payroll';
import { addExpense, editExpense, removeExpense } from '@/lib/expenses';
import * as catalog from '@/lib/catalog';
import { listActivePasses, sellPass } from '@/lib/passes';
import { passesEnabled } from '@/lib/features';
import { currentAccess, SubscriptionExpiredError } from '@/lib/subscription';
import { createBusiness } from '@/lib/tenant';
import { changePin, ProfileError } from '@/lib/profile';
import { createOrder, cancelOrder, type Payment } from '@/lib/orders';
import { canRecord, closeShift, openShift } from '@/lib/shifts';
import { SNOOZE_DAYS } from '@/lib/alerts';
import {
  endSession,
  getSession,
  rememberedLoginEnabled,
  requireOwner,
  requireSession,
  resumeRememberedSession,
  setRememberedLoginEnabled,
  switchSession,
} from '@/lib/auth';
import { checkLogin, clientIp, noteLogin } from '@/lib/login-guard';
import { listPoints, markPointUsed } from '@/lib/accounts';
import { isValidPhone, isValidPin, normalizePhone } from '@/lib/phone';
import { isNicheAvailable, type NicheKey } from '@/lib/niches';
import { logSecurityInBackground } from '@/lib/security-log';
import { beginPhoneProof, completePhoneProof } from '@/lib/auth-flow';

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

/* Вход и регистрация переехали в `app/auth-actions.ts`.

   Причина не в порядке файлов. Регистрация перестала быть одним
   действием: между «заполнил форму» и «есть аккаунт» встало
   подтверждение номера, а у входа появилась ветка с кодом при
   незнакомом устройстве. Это разговор с состоянием, и жить он должен
   там, где ничего, кроме него, нет.

   Здесь остаётся то, что делают УЖЕ вошедшие. */

export async function signOut() {
  const session = await getSession();
  await endSession({ remember: await rememberedLoginEnabled() });

  if (session) {
    logSecurityInBackground({
      event: 'auth.logout',
      tenantId: session.tid,
      userId: session.uid,
      ip: clientIp(await headers()),
    });
  }

  /* На витрину, а не на `/login`: страницы входа больше нет, и её
     адрес просто открыл бы окно поверх витрины — лишний перезаход
     ради того же экрана. */
  redirect('/');
}

/** Вход по сохранённому профилю: токен остаётся только в HttpOnly-cookie. */
export async function resumeSavedAccount(
  _prev: FormState,
  _formData: FormData,
): Promise<FormState> {
  const t = await getDict();
  void _prev;
  void _formData;
  await ensureDb();
  const role = await resumeRememberedSession();
  if (!role) return { error: t.auth.rememberedExpired };
  redirect(role === 'owner' ? '/owner' : '/work');
}

/** Настройка браузера; Server Action всё равно проверяет активную сессию. */
export async function setRememberLogin(enabled: boolean): Promise<void> {
  await requireSession();
  await setRememberedLoginEnabled(enabled);
  revalidatePath('/owner/profile');
}

/**
 * Перейти на другую свою точку.
 *
 * Точка живёт в подписанной cookie, а не в адресе, поэтому подменить её
 * запросом нельзя: сервер сам находит участие человека в запрошенном
 * бизнесе и отказывает, если участия нет. Чужой uuid при этом не
 * подтверждается — ответ один и тот же и для «не ваша точка», и для
 * «такой точки нет».
 */
export async function switchPoint(formData: FormData): Promise<void> {
  const session = await requireSession();
  await ensureDb();

  const target = String(formData.get('tid') ?? '');
  const me = await getUser(session.tid, session.uid);
  if (!me?.accountId) redirect('/session-ended');

  const points = await listPoints(me.accountId);
  const point = points.find((p) => p.id === target);
  if (!point) redirect(session.role === 'owner' ? '/owner' : '/work');

  await switchSession({
    membershipId: point.membershipId,
    tenantId: point.id,
    role: point.role,
  });
  await markPointUsed(point.membershipId);

  /* Обновляем всё дерево: на страницах лежат цифры прошлой мойки, и
     оставить их значило бы показать выручку одной точки под названием
     другой. */
  revalidatePath('/', 'layout');
  redirect(point.canRead ? (point.role === 'owner' ? '/owner' : '/work') : '/blocked');
}

/**
 * Завести ещё одну точку.
 *
 * Только из кабинета и только владельцем. Кода не спрашиваем: человек
 * только что вошёл, и второй вопрос про тот же код ничего не проверяет.
 *
 * Точка создаётся сразу закрытой — пробный срок даётся человеку один раз,
 * и он его уже получил. Про это написано в форме ДО кнопки, а не после:
 * узнать, что бесплатно не будет, человек должен до нажатия.
 */
export async function createPoint(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const niche = String(formData.get('niche') ?? '');
  const businessName = String(formData.get('businessName') ?? '').trim();

  if (!isNicheAvailable(niche)) return { error: t.errors.generic };
  if (businessName.length < 2) return { error: t.errors.required };

  const me = await getUser(session.tid, session.uid);
  if (!me?.accountId) redirect('/session-ended');

  /* Открытое действие не должно быть фабрикой бизнесов: без потолка сюда
     можно послать сто запросов подряд. Десять точек — это больше, чем
     бывает у настоящей сети, и меньше, чем нужно для вреда. */
  const mine = await listPoints(me.accountId);
  if (mine.length >= 10) return { error: t.errors.generic };

  const made = await createBusiness({
    niche: niche as NicheKey,
    businessName,
    ownerName: me.name,
    accountId: me.accountId,
  });

  /* Сразу переводим туда: человек только что её завёл, и оставить его на
     прежней точке значило бы заставить искать новую в списке. */
  const [membership] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, made.tenant.id), eq(users.accountId, me.accountId)));

  await switchSession({ membershipId: membership.id, tenantId: made.tenant.id, role: 'owner' });
  await markPointUsed(membership.id);

  revalidatePath('/', 'layout');
  redirect('/blocked');
}

/* -------------------------- сотрудники -------------------------- */

export async function addStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const name = String(formData.get('name') ?? '').trim();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const pin = String(formData.get('pin') ?? '');
  const percent = Number(formData.get('percent') ?? 0);

  if (name.length < 2) return { error: t.errors.required };
  if (!isValidPhone(phone)) return { error: t.errors.badPhone };
  if (!isValidPin(pin)) return { error: t.errors.badPin };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: t.errors.badPercent };
  }

  try {
    await catalog.addStaff({ tenantId: session.tid, name, phone, pin, percent });
  } catch (e) {
    if (e instanceof catalog.ValidationError && e.message === 'PHONE_TAKEN') {
      return { error: t.auth.phoneTaken };
    }
    return { error: t.errors.required };
  }

  /* Появление человека с доступом к деньгам бизнеса — событие
     безопасности, а не только строка в справочнике. */
  logSecurityInBackground({
    event: 'worker.created',
    tenantId: session.tid,
    userId: session.uid,
    data: { percent },
  });

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

  logSecurityInBackground({
    event: 'worker.deleted',
    tenantId: session.tid,
    userId: session.uid,
    data: { staffId },
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
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

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
    return { error: t.errors.required };
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
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const percent = Number(formData.get('percent') ?? 0);

  try {
    await catalog.saveStaff({ tenantId: session.tid, id, name, percent });
  } catch {
    return { error: t.errors.badPercent };
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

/**
 * Смена PIN из кабинета.
 *
 * В приложении это было, в вебе — нет: механизм в `lib/profile` есть с
 * самого начала, а дотянуться до него из браузера было нельзя. PIN
 * диктуют работнику вслух, работника однажды увольняют — и закрыть
 * доступ владельцу было нечем, кроме телефона.
 *
 * Старый код спрашивается обязательно, все сессии после смены гаснут —
 * включая эту. Так и задумано: тот, у кого старый PIN уже есть,
 * перестаёт работать. Человека выбрасывает на вход, где он заходит
 * новым.
 */
export async function changePinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const t = await getDict();
  await ensureDb();

  const current = String(formData.get('current') ?? '');
  const next = String(formData.get('next') ?? '');

  /* Тот же счётчик попыток, что на входе. Без него форма смены кода —
     тихий способ подобрать текущий PIN изнутри уже открытой сессии: без
     блокировки, без следа в истории входов и без предела попыток. */
  const ip = clientIp(await headers());
  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');

  const guard = await checkLogin(me.phone, ip);
  if (!guard.allowed) {
    return { error: t.auth.tooManyTries(Math.ceil(guard.retryAfter / 60)) };
  }

  try {
    await changePin(session.uid, current, next);
  } catch (e) {
    if (e instanceof ProfileError) {
      if (e.message === 'WRONG_PIN') await noteLogin(me.phone, ip, false);
      return { error: e.message === 'BAD_PIN' ? t.errors.badPin : t.auth.wrongPin };
    }
    return { error: t.errors.generic };
  }

  await noteLogin(me.phone, ip, true);
  logSecurityInBackground({
    event: 'auth.pin.changed',
    phone: me.phone,
    tenantId: session.tid,
    userId: session.uid,
    ip,
  });

  // сессия только что отозвана — идти внутрь больше некуда
  redirect('/?auth=signIn');
}

/* ------------------- подтверждение своего номера ------------------- */

export type VerifyPhoneState =
  | null
  | { step: 'idle'; error?: string }
  | { step: 'code'; challengeId: string; error?: string }
  | { step: 'done' };

/**
 * Доказать, что номер аккаунта — свой.
 *
 * Только для себя и только по своему номеру: он берётся из аккаунта, а
 * не из формы. Присланный номер здесь означал бы, что подтвердить можно
 * что угодно, — и восстановление PIN, которое на это подтверждение
 * опирается, потеряло бы смысл целиком.
 */
export async function verifyOwnPhoneAction(
  prev: VerifyPhoneState,
  formData: FormData,
): Promise<VerifyPhoneState> {
  const session = await requireSession();
  const t = await getDict();
  await ensureDb();

  const me = await getUser(session.tid, session.uid);
  if (!me?.accountId) redirect('/session-ended');

  const ip = clientIp(await headers());
  const locale = await getLocale();
  const challengeId = String(formData.get('challengeId') ?? '').trim();

  if (challengeId) {
    const done = await completePhoneProof({
      challengeId,
      code: String(formData.get('code') ?? '').trim(),
      accountId: me.accountId,
      ip,
    });

    if (!done) return { step: 'code', challengeId, error: t.auth.otpInvalid };

    revalidatePath('/owner/profile');
    return { step: 'done' };
  }

  const started = await beginPhoneProof({
    accountId: me.accountId,
    phone: me.phone,
    ip,
    locale,
  });

  if (!started.ok) {
    return {
      step: 'idle',
      error:
        started.reason === 'THROTTLED'
          ? t.auth.tooManyTries(Math.ceil(started.retryAfter / 60))
          : t.auth.smsFailed,
    };
  }

  void prev;
  return { step: 'code', challengeId: started.challengeId };
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
 * История одной машины — для выдвижной панели на списке клиентов.
 *
 * Серверным действием, а не запросом к `/api/v1/clients/:key`: тот
 * маршрут проверяет предъявителя по токену, а веб живёт на cookie, и
 * добывать токен в браузере ради чтения собственных данных значило бы
 * заводить второй способ доказать, кто ты. Действие уже знает сессию.
 *
 * Отдаёт только то, что рисует панель, и с уже посчитанными датами:
 * `Date` через границу сервер-клиент проходит, но час пересчёта на той
 * стороне будет чужой.
 */
/**
 * Вписать имя и телефон клиента.
 *
 * Отдельным действием, а не частью записи машины. Мойщик вводит номер,
 * услугу и оплату мокрыми руками, с очередью за спиной — просить у него
 * ещё и телефон значит либо получать пустое поле, либо задерживать
 * машину. Владелец же заходит в карточку постоянного спокойно, и там
 * телефон записать некуда только потому, что поля не было.
 *
 * Пустая строка стирает: человек попросил себя не беспокоить — это
 * должно выполняться одним движением, а не поиском кнопки «удалить».
 */
export async function saveClientContact(
  key: string,
  name: string,
  phone: string,
): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const cleanPhone = phone.trim();
  await db
    .update(clients)
    .set({
      name: name.trim() || null,
      phone: cleanPhone ? normalizePhone(cleanPhone) : null,
    })
    .where(and(eq(clients.tenantId, session.tid), eq(clients.key, key)));

  revalidatePath('/owner/clients');
}

export async function clientHistory(key: string) {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const found = await getClientHistory(session.tid, key);
  if (!found) return null;

  const tenant = await getTenant(session.tid);
  if (!tenant) return null;

  /* Даты собираются здесь, в поясе бизнеса, а не за границей
     сервер-клиент: `Date` туда проходит, но час пересчёта на той стороне
     будет чужой, и «первый визит 1 августа» у владельца в поездке
     превратился бы в 31 июля. */
  const day = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: tenant.timezone,
  });

  return {
    client: {
      key: found.client.key,
      name: found.client.name,
      phone: found.client.phone,
      visits: found.client.visits,
      total: found.client.total,
      daysSince: found.client.daysSince,
      firstSeen: day.format(found.client.firstSeenAt),
    },
    orders: found.orders.map((o) => ({
      id: o.id,
      serviceName: o.serviceName,
      price: o.price,
      payment: o.payment,
      staffName: o.staffName,
      day: dayMonth(o.createdAt, tenant.timezone),
      time: hhmm(o.createdAt, tenant.timezone),
    })),
  };
}

/**
 * Отметить расчёт — с одним человеком или сразу с несколькими.
 *
 * Сумма считается на сервере заново и НЕ приходит от клиента: снаружи
 * приходят только имена и дни. Иначе подделанный запрос запишет в
 * историю выплат что угодно.
 *
 * Сам расчёт делает `settleMany` — тот же, которым пользуется API
 * приложения. Здесь остаётся только то, что относится к вебу: сессия и
 * пересборка страниц кабинета.
 */
export type SettleResult = { ok: boolean; paid: number; people: number };

export async function settlePayroll(
  items: { staffId: string; day: string }[],
): Promise<SettleResult> {
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { ok: false, paid: 0, people: 0 };

  const result = await settleMany({
    tenantId: session.tid,
    byUserId: session.uid,
    timezone: tenant.timezone,
    items,
  });

  /* Раскладку целиком, а не только страницу: после расчёта меняется и
     повод в колокольчике, а он стоит на каждой странице кабинета. */
  revalidatePath('/owner', 'layout');

  return result;
}

/* ---------------------------- записи ---------------------------- */

/**
 * Отложить повод.
 *
 * Не «прочитано»: повод — состояние, и оно никуда не делось. Через
 * неделю он вернётся, если ничего не изменилось, — и это правильно.
 * Владелец, отложивший звонок клиентам, через неделю о нём вспомнит; а
 * если клиенты приехали сами, повода уже не будет.
 */
export async function snoozeAlert(key: string): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  const until = new Date(Date.now() + SNOOZE_DAYS * 86_400_000);

  await db
    .insert(alertSnoozes)
    .values({ tenantId: session.tid, userId: session.uid, key, until })
    /* Отложить дважды нельзя — второй раз просто продлевает срок. */
    .onConflictDoUpdate({
      target: [alertSnoozes.userId, alertSnoozes.key],
      set: { until, tenantId: session.tid },
    });

  revalidatePath('/owner', 'layout');
}

export async function addOrder(input: {
  clientKey: string;
  serviceId: string;
  payment: Payment;
  passId?: string;
  /**
   * Класс машины — СЛОВОМ, как его видел мойщик («Ջիպ»).
   *
   * Не номером: список классов владелец переставляет и переименовывает, а
   * у вкладки, открытой полчаса назад, он старый — номер указал бы на
   * соседний класс и на его цену. Слово либо совпадает с одним из
   * тарифов, либо не совпадает ни с одним, и тогда цена базовая. Тем же
   * правилом живёт запись с телефона.
   */
  tier?: string;
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
    /* Цену по классу считает сервер, а не браузер. Браузер её только
       показывает: присланная им сумма означала бы, что цену назначает
       тот, кто берёт деньги. */
    tier: input.tier,
    clientRef: input.clientRef,
  });

  // счётчик смены должен обновиться сразу — сотрудник на него смотрит
  refresh();
}

/**
 * Подсказка «этот клиент уже был» прямо во время набора номера.
 * Заодно отдаём активные абонементы — сотрудник должен увидеть
 * вариант «списать», а не брать деньги повторно.
 *
 * И класс машины из прошлой записи: он принадлежит машине, а не заезду,
 * и подставляется сам. Тот же ответ, что у `/api/v1/clients/lookup`.
 */
export async function lookupClient(key: string) {
  const session = await requireSession();
  if (key.trim().length < 3) return null;

  const client = await findClient(session.tid, key);
  if (!client) return null;

  const [active, lastTier] = await Promise.all([
    passesEnabled() ? listActivePasses(session.tid, client.id) : Promise.resolve([]),
    lastTierOf(session.tid, client.id),
  ]);

  return {
    visits: client.visits,
    total: client.total,
    lastSeenAt: client.lastSeenAt.toISOString(),
    lastTier,
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
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  if (!passesEnabled()) return { error: t.errors.generic };

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };
  if (!currentAccess(tenant).canWrite) return { error: t.billing.expiredTitle };

  const clientKey = String(formData.get('clientKey') ?? '').trim();
  const serviceId = String(formData.get('serviceId') ?? '');
  const totalUses = Number(formData.get('totalUses') ?? 0);
  const price = toMinor(Number(formData.get('price') ?? 0), tenant.currency);
  const validDays = Number(formData.get('validDays') ?? 0);

  if (!clientKey || !serviceId) return { error: t.errors.required };
  if (!Number.isInteger(totalUses) || totalUses < 1) return { error: t.errors.required };
  if (!Number.isFinite(price) || price < 0) return { error: t.errors.required };

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
    return { error: t.errors.generic };
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
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  const amount = toMinor(Number(formData.get('amount') ?? 0), tenant.currency);
  const category = String(formData.get('category') ?? '').trim();
  const monthly = formData.get('monthly') === 'on';
  const day = pastDay(String(formData.get('at') ?? ''), tenant.timezone);

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
         разойдётся с завтрашней без всякой причины.

         Разовый ложится тем днём, который выбрали: расходы заводят
         пачкой, за всю неделю сразу, и без этого вся неделя оказалась
         бы потрачена сегодня. */
      at: monthly ? startOfDay(tenant.timezone) : (day ?? undefined),
    });
  } catch {
    return { error: t.errors.required };
  }

  revalidateExpenses();
  return { ok: true };
}

/**
 * Что перечитать после правки расходов.
 *
 * Расход попадает в три разных ответа: в свой список, в прибыль дня на
 * сводке и в отчёт за месяц. Забытый путь означает, что владелец
 * добавил аренду, вернулся на сводку и увидел прежнюю прибыль — то есть
 * решил, что запись не легла.
 */
function revalidateExpenses() {
  revalidatePath('/owner/expenses');
  revalidatePath('/owner');
  revalidatePath('/owner/reports');
}

export async function removeExpenseAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  const removed = await removeExpense(
    session.tid,
    String(formData.get('id') ?? ''),
    startOfDay(tenant.timezone),
  );
  if (!removed) return { error: t.errors.generic };

  revalidateExpenses();
  return { ok: true };
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
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  try {
    const row = await editExpense({
      tenantId: session.tid,
      id: String(formData.get('id') ?? ''),
      userId: session.uid,
      amount: toMinor(Number(formData.get('amount') ?? 0), tenant.currency),
      category: String(formData.get('category') ?? ''),
      note: null,
      /* День правит только разовый; постоянному `editExpense` его не
         отдаст — там это дата начала действия, и сдвиг переписал бы
         прибыль за прожитые дни. */
      at: pastDay(String(formData.get('at') ?? ''), tenant.timezone) ?? undefined,
      dayStart: startOfDay(tenant.timezone),
    });
    if (!row) return { error: t.errors.generic };
  } catch {
    return { error: t.errors.required };
  }

  revalidateExpenses();
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
    await openShift(session.tid, session.uid, startOfDay(tenant.timezone), tenant.locale);
  } else {
    await closeShift(session.tid, session.uid, undefined, tenant.locale);
  }

  revalidatePath('/work');
  revalidatePath('/owner');
}

