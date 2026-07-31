import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { services, shifts, users } from './db/schema';
import { listServices } from './queries';
import { hashPin } from './pin';
import { isValidPhone, isValidPin, normalizePhone } from './phone';
import { revokeAllSessions } from './auth';

/**
 * Прайс и люди — то, что владелец правит из кабинета.
 *
 * Живёт отдельно от Server Actions, потому что то же самое делает API для
 * приложения. Веб и телефон обязаны вести себя одинаково: разойдись они —
 * и цена, поставленная с телефона, окажется не той, что видна в браузере.
 *
 * Проверки здесь, а не в форме: форму можно обойти прямым запросом.
 */

export class ValidationError extends Error {}

/* ------------------------------ услуги ------------------------------ */

/**
 * Создать или переименовать услугу.
 *
 * Правка цены НЕ трогает прошлые записи: в каждом заказе лежит снимок.
 * Поэтому владелец может менять прайс хоть каждый день — вчерашняя
 * выручка и зарплаты останутся прежними.
 */
export async function upsertService(params: {
  tenantId: string;
  id?: string;
  name: string;
  /** в минимальных единицах — так же, как в базе */
  price: number;
}) {
  const name = params.name.trim();
  if (!name) throw new ValidationError('NAME_REQUIRED');
  if (!Number.isFinite(params.price) || params.price < 0) {
    throw new ValidationError('BAD_PRICE');
  }

  if (params.id) {
    const [row] = await db
      .update(services)
      .set({ name, price: params.price })
      .where(and(eq(services.id, params.id), eq(services.tenantId, params.tenantId)))
      .returning();
    if (!row) throw new ValidationError('NOT_FOUND');
    return row;
  }

  const existing = await listServices(params.tenantId);
  const [row] = await db
    .insert(services)
    .values({ tenantId: params.tenantId, name, price: params.price, sort: existing.length })
    .returning();
  return row;
}

/** Не удаляем: на услугу ссылаются прошлые записи. */
export async function archiveService(params: { tenantId: string; id: string }) {
  const [row] = await db
    .update(services)
    .set({ active: false })
    .where(and(eq(services.id, params.id), eq(services.tenantId, params.tenantId)))
    .returning();
  if (!row) throw new ValidationError('NOT_FOUND');
  return row;
}

/* ---------------------------- сотрудники ---------------------------- */

export async function addStaff(params: {
  tenantId: string;
  name: string;
  phone: string;
  pin: string;
  percent: number;
}) {
  const name = params.name.trim();
  const phone = normalizePhone(params.phone);

  if (name.length < 2) throw new ValidationError('NAME_REQUIRED');
  if (!isValidPhone(phone)) throw new ValidationError('BAD_PHONE');
  if (!isValidPin(params.pin)) throw new ValidationError('BAD_PIN');
  if (!Number.isInteger(params.percent) || params.percent < 0 || params.percent > 100) {
    throw new ValidationError('BAD_PERCENT');
  }

  // один телефон = один аккаунт, и проверка глобальная, а не по бизнесу
  const taken = await db.select({ id: users.id }).from(users).where(eq(users.phone, phone));
  if (taken.length) throw new ValidationError('PHONE_TAKEN');

  const [row] = await db
    .insert(users)
    .values({
      tenantId: params.tenantId,
      phone,
      pinHash: await hashPin(params.pin),
      name,
      role: 'staff',
      percent: params.percent,
    })
    .returning();
  return row;
}

/**
 * Правка имени и процента.
 *
 * Процент меняется только НА БУДУЩЕЕ: в каждом заказе лежит снимок, и
 * прошлые зарплаты пересчитаны не будут. Это не побочный эффект, а
 * условие, без которого нельзя спокойно менять ставки.
 */
export async function saveStaff(params: {
  tenantId: string;
  id: string;
  name: string;
  percent: number;
}) {
  const name = params.name.trim();
  if (name.length < 2) throw new ValidationError('NAME_REQUIRED');
  if (!Number.isInteger(params.percent) || params.percent < 0 || params.percent > 100) {
    throw new ValidationError('BAD_PERCENT');
  }

  const [row] = await db
    .update(users)
    .set({ name, percent: params.percent })
    .where(and(eq(users.id, params.id), eq(users.tenantId, params.tenantId)))
    .returning();
  if (!row) throw new ValidationError('NOT_FOUND');
  return row;
}

/**
 * Отключить сотрудника.
 *
 * Не удаляем: у него есть история записей и выплат. И гасим все его
 * сессии — иначе уволенный останется в приложении до конца срока токена,
 * а это тридцать дней доступа к чужому бизнесу.
 */
export async function deactivateStaff(params: {
  tenantId: string;
  id: string;
  actorId: string;
}) {
  if (params.id === params.actorId) throw new ValidationError('CANNOT_DEACTIVATE_SELF');

  const [row] = await db
    .update(users)
    .set({ active: false })
    .where(and(eq(users.id, params.id), eq(users.tenantId, params.tenantId)))
    .returning();
  if (!row) throw new ValidationError('NOT_FOUND');

  await revokeAllSessions(params.id);

  /* Закрываем открытую смену. Без этого у уволенного человека вечно
     горит зелёная точка «на мойке» — доступ отобрали, а присутствие
     осталось. Ровно так это и выглядело в бою.

     Закрываем «сейчас»: человек работал до момента увольнения, и
     обнулять отработанное неправильно. */
  await db
    .update(shifts)
    .set({ closedAt: new Date() })
    .where(
      and(
        eq(shifts.tenantId, params.tenantId),
        eq(shifts.userId, params.id),
        isNull(shifts.closedAt),
      ),
    );

  return row;
}
