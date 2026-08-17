import { and, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { accounts, services, shifts, tenants, users } from './db/schema';
import { listServices } from './queries';
import { hashPin } from './pin';
import { isValidPhone, isValidPin, normalizePhone } from './phone';
import { revokeAccountSessions, revokeMembershipSessions } from './auth';
import { accountOf, claimAccount, PhoneTakenError } from './accounts';
import { logSecurity } from './security-log';
import { MAX_MONEY } from './money';

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
  /**
   * Цены по тарифам, в порядке `tenants.tiers`. Не передали — прежние
   * остаются нетронутыми: правка названия услуги не должна стирать прайс
   * по классам.
   */
  tierPrices?: number[] | null;
}) {
  const name = params.name.trim();
  if (!name) throw new ValidationError('NAME_REQUIRED');
  /* Потолок — из того же места, что и у расходов: столбец цены
     `integer`, и сумма больше двух миллиардов роняла вставку пятисоткой.
     Отказ должен называть причину, а не выглядеть поломкой сервера. */
  if (!Number.isFinite(params.price) || params.price < 0 || params.price > MAX_MONEY) {
    throw new ValidationError('BAD_PRICE');
  }

  let tierPrices: number[] | null | undefined;
  if (params.tierPrices !== undefined) {
    if (params.tierPrices === null) {
      tierPrices = null;
    } else {
      tierPrices = params.tierPrices.map((n) => {
        const v = Math.round(Number(n));
        if (!Number.isFinite(v) || v < 0 || v > MAX_MONEY) throw new ValidationError('BAD_PRICE');
        return v;
      });
      // всё пусто — то же самое, что тарифных цен нет вовсе
      if (tierPrices.every((v) => v === 0)) tierPrices = null;
    }
  }

  if (params.id) {
    const [row] = await db
      .update(services)
      .set({ name, price: params.price, ...(tierPrices !== undefined ? { tierPrices } : {}) })
      .where(and(eq(services.id, params.id), eq(services.tenantId, params.tenantId)))
      .returning();
    if (!row) throw new ValidationError('NOT_FOUND');
    return row;
  }

  const existing = await listServices(params.tenantId);
  const [row] = await db
    .insert(services)
    .values({
      tenantId: params.tenantId,
      name,
      price: params.price,
      tierPrices: tierPrices ?? null,
      sort: existing.length,
    })
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
  if (!Number.isInteger(params.percent) || params.percent < 0 || params.percent > 100) {
    throw new ValidationError('BAD_PERCENT');
  }

  if (!isValidPin(params.pin)) throw new ValidationError('BAD_PIN');

  /* Человека, который уже пользуется Tetrin, нанять нельзя, и это
     осознанный отказ, а не недоделка.
     
     Код сотруднику назначает работодатель и с тех пор его знает —
     работник код не выбирал и обычно не менял. Разреши мы взять такого
     человека на вторую мойку, его ПЕРВЫЙ работодатель получил бы рабочий
     ключ от чужого бизнеса: тот же номер, тот же код, вход как этот
     сотрудник.
     
     Чтобы это открыть, нужен не наём, а согласие: человек должен сам
     сменить код или подтвердить приглашение. До тех пор владелец второй
     мойки заводит ему отдельный номер — ровно как заводил до сих пор. */
  const pinHash = await hashPin(params.pin);
  const account = await claimAccount({ phone, pinHash }).catch((e) => {
    if (e instanceof PhoneTakenError) throw new ValidationError('PHONE_TAKEN');
    throw e;
  });

  const [row] = await db
    .insert(users)
    .values({
      tenantId: params.tenantId,
      accountId: account.id,
      phone,
      pinHash,
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
/**
 * Правка человека: имя, ставка или и то и другое.
 *
 * Поля необязательны, и это не удобство, а требование к PATCH: он меняет
 * названное и не трогает остальное. Раньше оба были обязательны, и
 * «поднять ставку до 50 %» одним полем возвращало 400 — притом что
 * маршрут так и назывался, «имя и процент». Форма кабинета и приложение
 * шлют оба поля всегда, поэтому в жизни это не всплывало; всплыло бы у
 * первого, кто пойдёт в API помимо них.
 *
 * Опасная половина отказа была в другом: пропущенное имя означало бы
 * пустое имя, а пропущенная ставка — ноль. Человек без ставки работает
 * бесплатно, и заметно это станет в день зарплаты.
 */
export async function saveStaff(params: {
  tenantId: string;
  id: string;
  name?: string;
  percent?: number;
}) {
  const patch: { name?: string; percent?: number } = {};

  if (params.name !== undefined) {
    const name = params.name.trim();
    if (name.length < 2) throw new ValidationError('NAME_REQUIRED');
    patch.name = name;
  }

  if (params.percent !== undefined) {
    if (!Number.isInteger(params.percent) || params.percent < 0 || params.percent > 100) {
      throw new ValidationError('BAD_PERCENT');
    }
    patch.percent = params.percent;
  }

  // Пустая правка — это опечатка в запросе, а не «оставить как было»:
  // молча ответив «сохранено», мы соврали бы про несохранённое.
  if (Object.keys(patch).length === 0) throw new ValidationError('NOTHING_TO_SAVE');

  const [row] = await db
    .update(users)
    .set(patch)
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

  /* Только сессии этого участия. Поколение человека не двигаем: он
     может работать на второй точке, и увольнение здесь не имеет права
     выкидывать его оттуда. */
  await revokeMembershipSessions(params.id);

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

/**
 * Выдать сотруднику новый код.
 *
 * ПОЧЕМУ ЭТО ВООБЩЕ НУЖНО. Мойщик забыл код. Восстановить по SMS он не
 * может: номер ему заводил владелец, и подтверждённым он не стал (см.
 * `claimAccount`), а восстановление работает только по подтверждённому.
 * Владелец сменить ему код тоже не мог: `saveStaff` правит имя и
 * процент, а `claimAccount` умеет назначить код только при создании
 * человека. Один забытый код означал потерю сотрудника из системы: его
 * оставалось отключить и завести заново на другой номер, потеряв связь с
 * его историей записей и выплат.
 *
 * ПОЧЕМУ ЭТО НЕ ДЫРА. Опасность здесь одна и названа в `claimAccount`:
 * если человек работает не только у нас, назначенный нами код открыл бы
 * чужой бизнес — тот же номер, тот же код, вход как этот человек. Поэтому
 * отказываем всем, у кого есть второе участие, и отказываем прямо: пусть
 * он сменит код сам, из своего профиля.
 *
 * Владельцу код так не выдают: владелец распоряжается собой сам, а
 * «выдать код владельцу» — это способ отобрать бизнес у совладельца.
 */
export async function resetStaffPin(params: {
  tenantId: string;
  id: string;
  actorId: string;
  pin: string;
}) {
  if (params.id === params.actorId) throw new ValidationError('CANNOT_RESET_SELF');
  if (!isValidPin(params.pin)) throw new ValidationError('BAD_PIN');

  const [staff] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.id, params.id),
        eq(users.tenantId, params.tenantId),
        eq(users.active, true),
      ),
    );
  if (!staff) throw new ValidationError('NOT_FOUND');
  if (staff.role !== 'staff') throw new ValidationError('OWNER_KEEPS_OWN_PIN');

  const account = await accountOf(staff);

  /* Второе участие — отказ. Считаем по человеку, а не по этой точке:
     код принадлежит человеку, и назначить его здесь значит назначить его
     сразу везде, где он работает. */
  const memberships = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.accountId, account.id), eq(users.active, true)));
  if (memberships.length > 1) throw new ValidationError('WORKS_ELSEWHERE');

  const pinHash = await hashPin(params.pin);

  /* Одной транзакцией: оборвись она между двумя записями, у человека
     остался бы новый код на входе и старый в подтверждении удаления
     бизнеса. */
  await db.transaction(async (tx) => {
    await tx.update(accounts).set({ pinHash }).where(eq(accounts.id, account.id));
    // копия в users, пока схема обязана оставаться совместимой
    await tx.update(users).set({ pinHash }).where(eq(users.accountId, account.id));
  });

  /* Гасим его входы. Смысл выдачи нового кода ровно в этом: тот, у кого
     остался старый — или чужой телефон с живым токеном, — перестаёт
     работать. */
  await revokeAccountSessions(account.id);

  await logSecurity({
    event: 'auth.pin.reset',
    phone: staff.phone,
    accountId: account.id,
    tenantId: params.tenantId,
    userId: params.actorId,
    data: { staffId: params.id, byOwner: true },
  });

  return staff;
}

/* ------------------------------ тарифы ------------------------------ */

/**
 * Цена услуги по тарифу.
 *
 * Единственное место, где это считается, — и на сервере, и в вебе, и в
 * ответах приложению. Правило одно: нет тарифа, нет цены для него или
 * цена нулевая — берём базовую. Поэтому включение тарифов ничего не
 * ломает, а добавление нового класса не требует немедленно проставить ему
 * цены: он просто стоит как базовый, пока владелец не решит иначе.
 */
export function priceForTier(
  service: { price: number; tierPrices?: number[] | null },
  tierIndex: number | null | undefined,
): number {
  if (tierIndex == null || tierIndex < 0) return service.price;
  const own = service.tierPrices?.[tierIndex];
  return typeof own === 'number' && own > 0 ? own : service.price;
}

/**
 * Список тарифов бизнеса.
 *
 * Пустой список и отсутствующий — одно и то же: свойства нет. Наружу
 * всегда отдаём массив, чтобы вызывающим не приходилось помнить про null.
 */
export function tiersOf(tenant: { tiers?: string[] | null }): string[] {
  return (tenant.tiers ?? []).map((t) => String(t).trim()).filter(Boolean);
}

/**
 * Найти тариф по его НАЗВАНИЮ.
 *
 * Телефон присылает слово, а не номер: у него список тарифов мог устареть
 * на одну правку прайса, и номер указал бы не туда. Слово либо совпадает,
 * либо тарифа нет — и тогда работает базовая цена.
 */
export function tierIndexOf(tenant: { tiers?: string[] | null }, name?: string | null): number | null {
  if (!name) return null;
  const wanted = name.trim().toLowerCase();
  if (!wanted) return null;
  const i = tiersOf(tenant).findIndex((t) => t.toLowerCase() === wanted);
  return i >= 0 ? i : null;
}

/**
 * Сохранить список тарифов.
 *
 * Цены услуг не трогаются: если класс убрали, его цена остаётся лежать в
 * массиве и вернётся, когда класс вернут. Стирать её значило бы наказывать
 * за опечатку в названии потерей всего прайса.
 */
export async function saveTiers(params: {
  tenantId: string;
  label: string | null;
  tiers: string[];
}) {
  const clean = params.tiers.map((t) => t.trim()).filter(Boolean).slice(0, 6);
  const label = params.label?.trim() || null;
  if (clean.length === 1) throw new ValidationError('TIERS_TOO_FEW');

  const [row] = await db
    .update(tenants)
    .set({ tiers: clean.length ? clean : null, tierLabel: clean.length ? label : null })
    .where(eq(tenants.id, params.tenantId))
    .returning();
  if (!row) throw new ValidationError('NOT_FOUND');
  return row;
}
