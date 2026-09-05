'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

import {
  endWorkerPreview,
  getLiveSession,
  requireOwner,
  startWorkerPreview,
} from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, listServices, startOfDay } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { addExpense } from '@/lib/expenses';
import * as catalog from '@/lib/catalog';
import { firstRunWorker, setFirstRunStage } from '@/lib/first-run';
import { isValidPhone, normalizePhone, pinProblem } from '@/lib/phone';
import { toMinor } from '@/lib/money';
import { logSecurityInBackground } from '@/lib/security-log';
import { getDict } from '@/lib/i18n/server';
import type { Dict } from '@/lib/i18n';

/**
 * Действия сценария первого запуска.
 *
 * Каждое — тонкая обёртка над тем же доменным слоем, которым живут
 * обычные разделы (`lib/catalog`, `lib/expenses`): сценарий создаёт
 * НАСТОЯЩИЕ данные бизнеса и ни одного собственного правила не вводит.
 * Своего здесь ровно два: сдвиг позиции сценария после удачного шага и
 * вход-выход в режим работника.
 *
 * Проверка сессии и подписки стоит в каждом действии: Server Action —
 * это открытый POST-эндпоинт, а не внутренняя функция (см. заметку у
 * requireWriteAccess в app/actions.ts).
 */

export type StepResult = { error?: string; ok?: true };

/** Отказ подписки — тем же словом, что и в остальных действиях. */
async function writeBlocked(tenantId: string, t: Dict): Promise<StepResult | null> {
  const tenant = await getTenant(tenantId);
  if (!tenant) return { error: t.errors.generic };
  if (!currentAccess(tenant).canWrite) return { error: t.billing.expiredTitle };
  return null;
}

/* ------------------------------ шаг 1 ------------------------------ */

export type ServiceRow = {
  /** пусто у строк, добавленных на самом шаге */
  id?: string;
  name: string;
  /** в ОСНОВНЫХ единицах валюты — так набирает форма */
  price: number;
};

/**
 * Сохранить прайс целиком: правки, добавления и удаления одним нажатием.
 *
 * Шаг работает со списком, а не с одной услугой, поэтому и действие
 * принимает список: три отдельных кнопки «сохранить», «добавить»,
 * «убрать» превратили бы первый экран продукта в упражнение по формам.
 * Внутри — те же upsertService/archiveService, что у раздела услуг.
 */
export async function saveServicesStep(rows: ServiceRow[]): Promise<StepResult> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  const cleaned = (Array.isArray(rows) ? rows : [])
    .slice(0, 50)
    .map((r) => ({
      id: typeof r.id === 'string' && r.id ? r.id : undefined,
      name: String(r.name ?? '').trim(),
      price: toMinor(Number(r.price ?? 0), tenant.currency),
    }))
    .filter((r) => r.name.length > 0 || r.id);

  if (cleaned.length === 0) return { error: t.firstRun.s1Empty };
  if (cleaned.some((r) => !r.name)) return { error: t.errors.required };

  const existing = await listServices(session.tid);
  const kept = new Set(cleaned.map((r) => r.id).filter(Boolean));

  try {
    /* Сначала правки и добавления, потом уборка: если что-то упадёт на
       середине, у бизнеса останется больше услуг, а не меньше. */
    for (const row of cleaned) {
      const before = row.id ? existing.find((s) => s.id === row.id) : undefined;
      if (before && before.name === row.name && before.price === row.price) continue;
      if (row.id && !before) continue; // услугу успели убрать с телефона
      await catalog.upsertService({
        tenantId: session.tid,
        id: row.id,
        name: row.name,
        price: row.price,
      });
    }
    for (const s of existing) {
      if (!kept.has(s.id)) {
        await catalog.archiveService({ tenantId: session.tid, id: s.id });
      }
    }
  } catch {
    return { error: t.errors.required };
  }

  await setFirstRunStage(session.uid, session.tid, 'services');
  revalidatePath('/owner/services');
  revalidatePath('/work');
  return { ok: true };
}

/* ------------------------------ шаг 2 ------------------------------ */

export async function addExpenseStep(input: {
  /** в основных единицах валюты */
  amount: number;
  category: string;
  monthly: boolean;
}): Promise<StepResult> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const tenant = await getTenant(session.tid);
  if (!tenant) return { error: t.errors.generic };

  try {
    await addExpense({
      tenantId: session.tid,
      userId: session.uid,
      amount: toMinor(Number(input.amount ?? 0), tenant.currency),
      category: String(input.category ?? '').trim(),
      monthly: input.monthly === true,
      /* Постоянный — с начала дня, разовый — сейчас: то же правило, что
         в addExpenseAction, и по той же причине. */
      at: input.monthly === true ? startOfDay(tenant.timezone) : undefined,
    });
  } catch {
    return { error: t.errors.required };
  }

  await setFirstRunStage(session.uid, session.tid, 'expense');
  revalidatePath('/owner/expenses');
  revalidatePath('/owner');
  revalidatePath('/owner/reports');
  return { ok: true };
}

/* ------------------------------ шаг 3 ------------------------------ */

export type StaffStepResult = StepResult & {
  worker?: { id: string; name: string; phone: string };
};

export async function addStaffStep(input: {
  name: string;
  phone: string;
  pin: string;
  percent: number;
}): Promise<StaffStepResult> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();
  const denied = await writeBlocked(session.tid, t);
  if (denied) return denied;

  const name = String(input.name ?? '').trim();
  const phone = normalizePhone(String(input.phone ?? ''));
  const pin = String(input.pin ?? '');
  const percent = Number(input.percent);

  if (name.length < 2) return { error: t.errors.required };
  if (!isValidPhone(phone)) return { error: t.errors.badPhone };
  /* Две разные беды кода — двумя разными словами, как в addStaff. */
  const badPin = pinProblem(pin);
  if (badPin === 'length') return { error: t.errors.badPin };
  if (badPin === 'trivial') return { error: t.auth.pinTrivial };
  if (!Number.isInteger(percent) || percent < 0 || percent > 100) {
    return { error: t.errors.badPercent };
  }

  let made: { id: string; name: string; phone: string };
  try {
    const row = await catalog.addStaff({ tenantId: session.tid, name, phone, password: pin, percent });
    made = { id: row.id, name: row.name, phone: row.phone };
  } catch (e) {
    if (e instanceof catalog.ValidationError && e.message === 'PHONE_TAKEN') {
      return { error: t.auth.phoneTaken };
    }
    return { error: t.errors.required };
  }

  /* Человек с доступом к деньгам бизнеса — событие безопасности,
     откуда бы его ни завели. */
  logSecurityInBackground({
    event: 'worker.created',
    tenantId: session.tid,
    userId: session.uid,
    data: { percent },
  });

  await setFirstRunStage(session.uid, session.tid, 'staff');
  revalidatePath('/owner/staff');
  return { ok: true, worker: made };
}

/* --------------------- режим «глазами работника» --------------------- */

/**
 * Войти в режим работника.
 *
 * Целевого работника выбирает сервер, а не форма: превью положено
 * последнему заведённому работнику этой точки, и присланный с клиента
 * идентификатор был бы лишним словом, которому пришлось бы не верить.
 */
export async function enterWorkerPreview(): Promise<StepResult> {
  const t = await getDict();
  const session = await requireOwner();
  await ensureDb();

  const worker = await firstRunWorker(session.tid);
  if (!worker) return { error: t.errors.generic };

  const opened = await startWorkerPreview(worker.id);
  if (!opened) return { error: t.errors.generic };

  logSecurityInBackground({
    event: 'auth.preview.started',
    tenantId: session.tid,
    userId: session.uid,
    data: { workerId: worker.id },
  });

  await setFirstRunStage(session.uid, session.tid, 'preview');
  redirect('/work');
}

/**
 * Вернуться владельцем.
 *
 * Доступно из превью, поэтому requireOwner здесь не стоит: действие
 * лишь удаляет превью-cookie и гасит его сессию, а дальше человека
 * встречает /onboarding уже от владельческой cookie.
 */
export async function leaveWorkerPreview(): Promise<void> {
  await ensureDb();
  await endWorkerPreview();

  const session = await getLiveSession();
  if (session?.role === 'owner') {
    logSecurityInBackground({
      event: 'auth.preview.ended',
      tenantId: session.tid,
      userId: session.uid,
    });
  }

  revalidatePath('/work');
  redirect('/onboarding');
}

/* ------------------------------ финал ------------------------------ */

/**
 * Закрыть сценарий навсегда: и с финального экрана, и тихой дверью
 * «настроить позже». Разницу между «прошёл» и «пропустил» продукт и так
 * видит по данным бизнеса — отдельного слова для неё не нужно.
 */
export async function finishFirstRun(): Promise<void> {
  const session = await requireOwner();
  await ensureDb();
  await setFirstRunStage(session.uid, session.tid, 'done');
  revalidatePath('/', 'layout');
  redirect('/owner');
}
