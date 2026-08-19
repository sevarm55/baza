'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { refresh, revalidatePath } from 'next/cache';
import { and, eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { ensureDb } from '@/lib/db/ready';
import { alertSnoozes, clients, tenants, users } from '@/lib/db/schema';
import { getDict, getLocale } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';
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
import { tiersOf } from '@/lib/catalog';
import { listActivePasses, sellPass } from '@/lib/passes';
import { passesEnabled } from '@/lib/features';
import { currentAccess, SubscriptionExpiredError } from '@/lib/subscription';
import { createBusiness } from '@/lib/tenant';
import { revokeDevice } from '@/lib/devices';
import { changePin, deletePin, ProfileError, saveProfile } from '@/lib/profile';
import { createOrder, cancelOrder, setOrderCrew, type Payment } from '@/lib/orders';
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
import { accountOf, listPoints, markPointUsed } from '@/lib/accounts';
import { hasPin } from '@/lib/pin';
import { isValidPhone, maskPhone, normalizePhone, pinProblem } from '@/lib/phone';
import {
  changeNeedsCode,
  finishPhoneChange,
  startPhoneChange,
  startSelfProof,
  type PhoneProblem,
} from '@/lib/phone-change';
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
 * Слать ли уведомление о каждой записи.
 *
 * Настройка человека, а не браузера: она лежит в базе и решает, придёт
 * ли пуш на телефон. Поэтому её обязано быть видно с обеих сторон —
 * владелец, который сидит за компьютером, выключает уведомления на
 * телефоне именно отсюда, а не ищет телефон, чтобы выключить их там.
 *
 * Только владельцу: уведомления о записях уходят владельцам (см.
 * `notifyOwners`), и мойщику этот выключатель не отвечает ни на что.
 * Проверяем здесь же, а не только на экране: экран никогда не граница
 * доступа.
 */
export async function setNotifyOrders(enabled: boolean): Promise<void> {
  const session = await requireOwner();
  await ensureDb();

  await db.update(users).set({ notifyOrders: enabled }).where(eq(users.id, session.uid));
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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const name = String(formData.get('name') ?? '').trim();
  const phone = normalizePhone(String(formData.get('phone') ?? ''));
  const pin = String(formData.get('pin') ?? '');
  const percent = Number(formData.get('percent') ?? 0);

  if (name.length < 2) return { error: t.errors.required };
  if (!isValidPhone(phone)) return { error: t.errors.badPhone };
  /* «Мало цифр» и «слишком очевидный» — разные беды, и общий ответ на
     них заставляет владельца гадать. Он в этот момент стоит рядом с
     новым мойщиком и придумывает ему код вслух. */
  const badPin = pinProblem(pin);
  if (badPin === 'length') return { error: t.errors.badPin };
  if (badPin === 'trivial') return { error: t.auth.pinTrivial };
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
  await requireWriteAccess(session.tid);

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
 * Проверка подписки перед любой записью.
 *
 * Блокируем только запись. Чтение, отчёты и выгрузка остаются открытыми:
 * данные принадлежат бизнесу, а не нам.
 *
 * ПОЧЕМУ ЭТО СТОИТ В КАЖДОМ ДЕЙСТВИИ, А НЕ ОДИН РАЗ В РАСКЛАДКЕ.
 * Раскладка кабинета правда уводит просроченного на `/blocked`, и через
 * интерфейс он ничего не запишет. Но Server Action — это открытый
 * POST-эндпоинт, а не внутренняя функция: cookie у него ещё живая, и
 * прямым запросом действие проходило. API на те же операции отвечал 402,
 * то есть веб разрешал то, что запрещало приложение, — и расходились они
 * молча, в защите.
 */
async function requireWriteAccess(tenantId: string) {
  const tenant = await getTenant(tenantId);
  if (!tenant) throw new Error('NO_TENANT');
  if (!currentAccess(tenant).canWrite) throw new SubscriptionExpiredError();
  return tenant;
}

/**
 * То же самое для действий, которые отвечают формой, а не исключением.
 *
 * Отказ здесь надо показать человеку в той же форме, где он нажал, —
 * брошенное исключение превратилось бы в страницу ошибки поверх
 * заполненных полей. Возвращает готовый отказ или `null`, если писать
 * можно.
 */
async function writeBlocked(tenantId: string, t: Dict): Promise<FormState> {
  const tenant = await getTenant(tenantId);
  if (!tenant) return { error: t.errors.generic };
  if (!currentAccess(tenant).canWrite) return { error: t.billing.expiredTitle };
  return null;
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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  const price = toMinor(Number(formData.get('price') ?? 0), tenant.currency);

  /**
   * Цены по классам.
   *
   * Приходят полем на класс, в порядке `tenants.tiers`, и только когда
   * форма их вообще показывала: у мойки без классов ряда нет, и слать
   * оттуда пустой массив значило бы стереть прайс, выставленный с
   * телефона. Отсутствие поля и есть «не трогать» — так же его понимает
   * `upsertService`.
   *
   * Пустая клетка означает «как базовая», и уезжает нулём: правило
   * «нет своей цены — берём базовую» живёт в `priceForTier`, одно на
   * весь продукт. Заполнять её за человека нельзя — тогда поднятие
   * базовой цены перестало бы поднимать цены классов.
   */
  const tiers = tiersOf(tenant);
  const tierPrices = formData.has('tierPrices')
    ? tiers.map((_, i) => {
        const raw = String(formData.get(`tierPrice${i}`) ?? '').trim();
        return raw ? toMinor(Number(raw), tenant.currency) : 0;
      })
    : undefined;

  try {
    await catalog.upsertService({
      tenantId: session.tid,
      id: id || undefined,
      name,
      price,
      tierPrices,
    });
  } catch {
    return { error: t.errors.required };
  }

  revalidatePath('/owner/services');
  return { ok: true };
}

/**
 * Классы машин: как свойство называется и какие в нём варианты.
 *
 * ПОЧЕМУ ЭТО ПОЯВИЛОСЬ В ВЕБЕ. Свойство включалось только с телефона:
 * кабинет умел классы ПОКАЗЫВАТЬ при записи, но не умел их завести. То
 * есть бизнес, настроенный через браузер, не получал их никогда — целая
 * часть продукта была доступна половине клиентов.
 *
 * Пустой список выключает свойство. Один класс запрещён на сервере:
 * один вариант — это отсутствие вариантов, поданное как выбор, и мойщик
 * жал бы единственную кнопку сорок раз за смену.
 *
 * Цены услуг при этом не трогаются: убрали класс — его цена остаётся
 * лежать и вернётся вместе с ним. Стирать её значило бы наказывать за
 * опечатку в названии потерей всего прайса.
 */
export async function saveTiersAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  try {
    await catalog.saveTiers({
      tenantId: session.tid,
      label: String(formData.get('label') ?? ''),
      tiers: formData.getAll('tier').map((v) => String(v)),
    });
  } catch (e) {
    if (e instanceof catalog.ValidationError && e.message === 'TIERS_TOO_FEW') {
      return { error: t.settings.tiersTooFew };
    }
    return { error: t.errors.generic };
  }

  /* Классы меняют прайс целиком, поэтому перечитываем и услуги, и экран
     смены: там из них собран ряд кнопок и весь ряд цен. */
  revalidatePath('/owner/services');
  revalidatePath('/work');
  return { ok: true };
}

/** Не удаляем: на услугу ссылаются прошлые записи. */
export async function archiveService(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();
  await requireWriteAccess(session.tid);

  const id = String(formData.get('id') ?? '');
  await catalog.archiveService({ tenantId: session.tid, id }).catch(() => {});

  revalidatePath('/owner/services');
}

export async function saveStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

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

/**
 * Выдать сотруднику новый код.
 *
 * Нужно потому, что забытый мойщиком код был тупиком: восстановить по SMS
 * он не может (номер ему заводил владелец и подтверждённым не стал), а
 * сменить его владелец не мог вовсе. Оставалось отключить человека и
 * завести заново на другой номер, потеряв связь с его историей.
 *
 * Кому нельзя и почему — в `resetStaffPin`. Главное там: человеку,
 * который работает не только здесь, код так не выдают. Назначенный нами
 * код открыл бы чужой бизнес.
 */
export async function resetStaffPinAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  try {
    await catalog.resetStaffPin({
      tenantId: session.tid,
      id: String(formData.get('id') ?? ''),
      actorId: session.uid,
      pin: String(formData.get('pin') ?? ''),
    });
  } catch (e) {
    if (e instanceof catalog.ValidationError) {
      if (e.message === 'BAD_PIN') {
        /* «Мало цифр» и «слишком очевидный» здесь не различаются:
           `isValidPin` отвечает одним признаком, и придумывать разницу
           только для этой формы значило бы соврать про правило. */
        return { error: t.errors.badPin };
      }
      if (e.message === 'WORKS_ELSEWHERE') return { error: t.settings.pinWorksElsewhere };
      return { error: t.errors.generic };
    }
    return { error: t.errors.generic };
  }

  logSecurityInBackground({
    event: 'role.changed',
    tenantId: session.tid,
    userId: session.uid,
    data: { staffId: String(formData.get('id') ?? ''), what: 'pin' },
  });

  revalidatePath('/owner/staff');
  return { ok: true };
}

/**
 * Общий процент команды за совместную мойку.
 *
 * Пустое поле выключает свойство: мойщику совместная мойка перестаёт
 * предлагаться, и сервер её не принимает. Уже записанные при этом не
 * пересчитываются — ни одна: применённая ставка и посчитанные доли лежат
 * снимками в самой записи (см. `saveTeamPercent`).
 */
export async function saveTeamPercentAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const raw = String(formData.get('percent') ?? '').trim();
  /* Пусто — выключить, а не ноль. Ноль означал бы «мойте вместе
     бесплатно», и это настоящий, хоть и странный, выбор владельца;
     пустое поле означает «такого у нас не бывает». Путать их нельзя. */
  const percent = raw === '' ? null : Number(raw);

  try {
    await catalog.saveTeamPercent({ tenantId: session.tid, percent });
  } catch {
    return { error: t.errors.badPercent };
  }

  revalidatePath('/owner/staff');
  revalidatePath('/work');
  return { ok: true };
}

/**
 * Правка состава уже записанной мойки.
 *
 * Нужна ровно для одного случая, и он частый: мыли втроём, а отметили
 * двоих. Без правки третий остаётся без денег, а единственным выходом
 * была бы отмена записи и повторный ввод — то есть потеря номера, услуги
 * и порядка в ленте ради одной галочки.
 *
 * Правит владелец: состав — это чужая зарплата, и менять её должен тот,
 * кто за неё платит. Как пересчитывается фонд и почему прошлая ставка не
 * трогается — в `setOrderCrew`.
 */
export async function saveOrderCrew(
  orderId: string,
  participantIds: string[],
): Promise<FormState> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  try {
    await setOrderCrew({
      tenantId: session.tid,
      orderId,
      byUserId: session.uid,
      participantIds,
    });
  } catch (e) {
    const reason = e instanceof Error ? e.message : '';
    if (reason === 'TEAM_PERCENT_UNSET') return { error: t.crew.needPercent };
    return { error: t.errors.generic };
  }

  refresh();
  return { ok: true };
}

export async function archiveStaff(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();
  await requireWriteAccess(session.tid);

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
/**
 * Своё имя.
 *
 * Механизм существовал с самого начала (`saveProfile`), и приложение им
 * пользуется через `PATCH /api/v1/profile`, а из браузера дотянуться до
 * него было нельзя: в кабинете имя показывали текстом. Человек,
 * набравший себя с опечаткой при регистрации, видел её на каждом экране
 * — в ленте, на смене, в зарплатах — и починить не мог.
 *
 * Роли здесь не проверяем: имя — данные о себе, а не о бизнесе, и
 * править его вправе любой вошедший. Название бизнеса меняет отдельное
 * действие, и оно спрашивает владельца.
 */
export async function saveOwnName(_prev: FormState, formData: FormData): Promise<FormState> {
  const t = await getDict();
  const session = await requireSession();
  await ensureDb();

  const name = String(formData.get('name') ?? '').trim();

  try {
    await saveProfile({ userId: session.uid, tenantId: session.tid, name });
  } catch (e) {
    if (e instanceof ProfileError) return { error: t.errors.required };
    return { error: t.errors.generic };
  }

  /* Имя стоит не только в профиле: оно в шапке телефона, в меню внизу
     колонки и в каждом списке, где этот человек упоминается. Полотно
     кабинета обновляется целиком, иначе старое имя останется висеть в
     колонке рядом с новым в профиле. */
  revalidatePath('/owner', 'layout');
  return { ok: true };
}

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

  /* Была ли у человека вторая дверь до этой минуты. От этого зависит,
     выкидывать ли его: смена кода гасит сессии, а первая установка —
     нет, отбирать там нечего. */
  const account = await accountOf(me);
  const had = hasPin(account.pinHash);

  try {
    await changePin(session.uid, current, next);
  } catch (e) {
    if (e instanceof ProfileError) {
      if (e.message === 'WRONG_PIN') await noteLogin(me.phone, ip, false);
      if (e.message === 'BAD_PIN') return { error: t.errors.badPin };
      if (e.message === 'TRIVIAL_PIN') return { error: t.auth.pinTrivial };
      return { error: t.auth.wrongPin };
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

  /* Сменил — сессии погашены, включая эту, идти внутрь больше некуда.
     Задал впервые — остаётся на месте, как после любой другой правки в
     профиле. */
  if (had) redirect('/?auth=signIn');

  revalidatePath('/owner/profile');
  return { ok: true };
}

/**
 * Убрать код доступа совсем.
 *
 * Третье действие рядом с «создать» и «изменить», и оно не декоративное:
 * код доступа необязателен, а до сих пор заведённый однажды нельзя было
 * убрать никак. Человек, назначивший себе постоянный код и передумавший,
 * оставался с ним навсегда.
 *
 * Текущий код спрашиваем, тот же счётчик попыток, что на входе: без него
 * форма — тихий способ подобрать код изнутри уже открытой сессии.
 *
 * После удаления сессии погашены, включая эту, — как при смене. Уводим на
 * вход: идти внутрь больше некуда.
 */
export async function deletePinAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();
  const t = await getDict();
  await ensureDb();

  const current = String(formData.get('current') ?? '');

  const ip = clientIp(await headers());
  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');

  const guard = await checkLogin(me.phone, ip);
  if (!guard.allowed) {
    return { error: t.auth.tooManyTries(Math.ceil(guard.retryAfter / 60)) };
  }

  try {
    await deletePin(session.uid, current);
  } catch (e) {
    if (e instanceof ProfileError) {
      await noteLogin(me.phone, ip, false);
      return { error: t.auth.wrongPin };
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
    data: { deleted: true },
  });

  redirect('/?auth=signIn');
}

/* --------------------------- устройства --------------------------- */

/**
 * Погасить чужой вход.
 *
 * Гасить можно только своё — проверку делает `revokeDevice` условием в
 * самом UPDATE, а не этот код: id сессии угадываемый uuid, и без неё
 * любой вошедший выкидывал бы кого угодно.
 *
 * Роль не спрашиваем: это данные о себе, а не о бизнесе, и закрывать
 * свои входы вправе любой вошедший. Состояние счёта тоже не смотрим —
 * безопасность не зависит от оплаты.
 */
export async function revokeDeviceAction(sessionId: string): Promise<void> {
  const session = await requireSession();
  await ensureDb();

  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');

  await revokeDevice({
    userId: session.uid,
    sessionId,
    tenantId: session.tid,
    phone: me.phone,
    ip: clientIp(await headers()),
  });

  revalidatePath('/owner/profile');
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

/* ------------------------ смена своего номера ------------------------ */

export type ChangePhoneState =
  | null
  /** закрыто, или вернулись после отказа */
  | { step: 'idle'; error?: string }
  /** у кого нет PIN: код на свой номер */
  | { step: 'proof'; proofId: string; phone: string; error?: string }
  /** доказали себя, называем новый номер */
  | { step: 'phone'; proofId?: string; proofCode?: string; error?: string }
  /** код с нового номера */
  | { step: 'code'; challengeId: string; phone: string; error?: string }
  | { step: 'done' };

/**
 * Сменить свой номер телефона.
 *
 * Считает `lib/phone-change.ts` — тот же код, которым живёт приложение.
 * Действие только раскладывает форму по шагам и переводит отказы на язык
 * смотрящего: правила безопасности не имеют права зависеть от того, с
 * сайта пришли или с телефона.
 *
 * Шагов на экране до трёх, и первый из них появляется не у всех: тому, у
 * кого есть PIN, доказывать себя кодом незачем — он вводит PIN на том же
 * шаге, где называет новый номер.
 */
export async function changePhoneAction(
  prev: ChangePhoneState,
  formData: FormData,
): Promise<ChangePhoneState> {
  const session = await requireSession();
  const t = await getDict();
  await ensureDb();

  const me = await getUser(session.tid, session.uid);
  if (!me) redirect('/session-ended');
  const account = await accountOf(me);

  const ip = clientIp(await headers());
  const locale = await getLocale();
  const field = (name: string) => String(formData.get(name) ?? '').trim();

  /* Отказ модуля — в строку на экране. Один разбор на все шаги: два
     списка сообщений разошлись бы на первой же новой причине. */
  const say = (problem: PhoneProblem, retryAfter?: number): string => {
    switch (problem) {
      case 'BAD_PHONE':
        return t.errors.badPhone;
      case 'SAME_PHONE':
        return t.auth.samePhone;
      case 'PHONE_TAKEN':
        return t.auth.phoneTaken;
      case 'WRONG_PIN':
        return t.auth.wrongPin;
      case 'THROTTLED':
        return t.auth.tooManyTries(Math.ceil((retryAfter ?? 60) / 60));
      case 'CODE_EXPIRED':
        return t.auth.otpExpired;
      case 'CODE_TOO_MANY':
        return t.auth.otpTooMany;
      case 'SMS_FAILED':
        return t.auth.smsFailed;
      default:
        return t.auth.otpInvalid;
    }
  };

  const challengeId = field('challengeId');

  /* ---- шаг последний: код с нового номера ---- */
  if (challengeId) {
    const done = await finishPhoneChange({
      account,
      tenantId: session.tid,
      userId: session.uid,
      challengeId,
      code: field('code'),
      ip,
    });

    if (!done.ok) {
      return { step: 'code', challengeId, phone: field('shown'), error: say(done.problem) };
    }

    /* Страницу НЕ перерисовываем, и это не забывчивость. Смена гасит все
       сессии, включая эту; `revalidatePath` пошёл бы на сервер уже
       мёртвым cookie и увёл бы на экран входа. Человек увидел бы, что
       его выкинуло, но не узнал бы, почему, — а причина ровно та, что он
       только что сделал. Поэтому последним кадром остаётся «номер
       изменён, войдите заново», и уходит человек сам. */
    return { step: 'done' };
  }

  /* ---- нулевой шаг: код на свой номер, у кого нет PIN ---- */
  if (changeNeedsCode(account) && !field('proofId')) {
    const started = await startSelfProof({ account, ip, locale });
    if (!started.ok) return { step: 'idle', error: say(started.problem, started.retryAfter) };

    void prev;
    return { step: 'proof', proofId: started.challengeId, phone: maskPhone(account.phone) };
  }

  const proofId = field('proofId');
  const proofCode = field('proofCode');

  /* Между «доказал себя» и «назвал номер» экран меняется, а
     доказательство обязано дожить до конца: код проверяется один раз,
     вместе с новым номером. Пока номера нет, спрашивать нечего. */
  if (!field('phone')) return { step: 'phone', proofId, proofCode };

  const started = await startPhoneChange({
    account,
    phone: field('phone'),
    country: field('country') || undefined,
    pin: field('pin'),
    proofId,
    proofCode,
    ip,
    locale,
  });

  if (!started.ok) {
    /* Просроченный или исчерпанный код на СВОЙ номер отбрасывает в
       начало: доказывать себя придётся заново, и оставлять человека на
       экране с мёртвым кодом в скрытом поле значило бы показывать ему
       одну и ту же ошибку до перезагрузки страницы. */
    const dead =
      started.problem === 'CODE_EXPIRED' ||
      started.problem === 'CODE_TOO_MANY' ||
      started.problem === 'CODE_INVALID';
    if (changeNeedsCode(account) && dead) {
      return { step: 'idle', error: say(started.problem, started.retryAfter) };
    }
    return { step: 'phone', proofId, proofCode, error: say(started.problem, started.retryAfter) };
  }

  return { step: 'code', challengeId: started.challengeId, phone: maskPhone(started.phone) };
}

export async function saveBusiness(formData: FormData): Promise<void> {
  const session = await requireOwner();
  await ensureDb();
  await requireWriteAccess(session.tid);

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
  await requireWriteAccess(session.tid);

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
      /* Прайс — только когда взяли меньше. Скидка живёт в истории
         машины наравне с ценой: постоянному её дают не один раз, и
         владелец должен видеть, сколько всего простил. */
      listPrice: o.listPrice !== null && o.listPrice > o.price ? o.listPrice : null,
      payment: o.payment,
      /* Кто внёс запись и кто над ней работал. У одиночной мойки это
         один человек, у совместной — разные ответы, и карточку клиента
         открывают ради второго: «в прошлый раз поцарапали, кто мыл». */
      staffName: o.staffName,
      crew: o.crew.map((p) => ({ name: p.name })),
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
  /* Просрочка закрывает и расчёт: `POST /payouts` требует того же, и
     веб не должен разрешать то, что запрещает приложение. Отдельной
     строкой отказа здесь нет — форма и так показывает `ok: false`. */
  if (!currentAccess(tenant).canWrite) return { ok: false, paid: 0, people: 0 };

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
  /** одна услуга — форма записей, уже лежащих в офлайн-очереди */
  serviceId?: string;
  /**
   * Несколько услуг за один заезд.
   *
   * За один заезд делают комплекс и химчистку салона, и в браузере это
   * до сих пор записывали двумя машинами: число машин, средний чек и
   * счётчик визитов клиента выходили завышенными. Телефон умел это
   * давно, сервер тоже (`createOrder`); не умела только эта дверь.
   */
  serviceIds?: string[];
  payment: Payment;
  passId?: string;
  /**
   * Сколько взяли, если меньше прайса.
   *
   * Скидки на мойке дают — постоянному, за брак, «по-соседски». Пока
   * продукт этого не умел, мойщик выбирал услугу подешевле или не
   * записывал вовсе, и цифры расходились с кассой. Потолок и проверка
   * живут на сервере: здесь сумму передают, а не назначают.
   */
  price?: number;
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
  /**
   * Кто ещё мыл эту машину, кроме того, кто записывает.
   *
   * Пусто — одиночная мойка, всё как раньше. Себя в список класть не
   * надо: автор записи участник по определению, и требовать от него
   * галочку напротив собственного имени значит однажды оставить его без
   * денег за свою же работу.
   *
   * Проверяет состав сервер (`createOrder`): форма рисует только своих
   * активных коллег, но отправить можно что угодно.
   */
  participantIds?: string[];
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
    participantIds: input.participantIds?.length ? input.participantIds : undefined,
    serviceId: input.serviceId,
    serviceIds: input.serviceIds?.length ? input.serviceIds : undefined,
    clientKey: input.clientKey,
    payment: input.payment,
    passId: input.passId,
    /* Цену по классу считает сервер, а не браузер. Браузер её только
       показывает: присланная им сумма означала бы, что цену назначает
       тот, кто берёт деньги.

       Скидка — исключение, и оно проверяемое: `createOrder` не пускает
       ни выше прайса, ни ниже нуля. То есть браузер может сказать «взяли
       меньше», но не «взяли сколько захочу». */
    price: typeof input.price === 'number' ? input.price : undefined,
    tier: input.tier,
    clientRef: input.clientRef,
    /* Язык и валюта уведомления — бизнеса, а не браузера: пуш прилетит
       владельцу на телефон, а не тому, кто записал машину. Тенант здесь
       уже прочитан ради проверки смены — второго запроса не нужно. */
    locale: tenantForShift.locale,
    currency: tenantForShift.currency,
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
  /* Отмена — тоже запись: она меняет выручку и зарплату. `POST
     /orders/:id/cancel` требует права записи, и веб обязан требовать
     того же. */
  await requireWriteAccess(session.tid);

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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

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
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

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
 * Сдаваемую сумму спрашиваем и здесь.
 *
 * Раньше не спрашивали, и это было решением «ради второго по важности
 * клиента». Оно оказалось дороже, чем выглядело: сдача наличных —
 * единственный момент, когда деньги переходят из рук в руки, и
 * единственный контроль, ради которого продукт стоит. Мойщик, закрывший
 * смену в браузере, не отмечал ничего, владелец видел «не отмечено», и
 * недостача не всплывала вовсе — ни в тот вечер, ни при сверке.
 *
 * Поле необязательное: закрыться человек должен уметь всегда. Не
 * прислали — по-прежнему «не отмечено», и это честнее нуля.
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
    /* Только целое и неотрицательное. Не число — значит «не отметил», а
       не ноль: это разные вещи, и владелец должен их различать. Правило
       то же, что в `/api/v1/shift`. */
    const raw = formData.get('cash');
    const asked = typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;
    const declared = Number.isInteger(asked) && asked >= 0 ? asked : undefined;

    await closeShift(session.tid, session.uid, declared, tenant.locale);
  }

  revalidatePath('/work');
  revalidatePath('/owner');
}

