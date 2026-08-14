import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db } from './db';
import { jobs, services, users } from './db/schema';
import { normalizeClientKey } from './client-key';
import { NotFoundError } from './orders';
import { notifyUserInBackground } from './push';

/**
 * Наряды: принятая машина и мойщик, которому её отдали.
 *
 * Раньше продукт знал только результат — запись о вымытой машине. Между
 * «машина заехала» и «машина готова» не было ничего: владелец говорил
 * мойщику вслух, и ни очереди, ни ответа «я взял» не существовало. На
 * мойке с двумя постами это работает, на четырёх — уже нет: две машины
 * достаются одному, третья не достаётся никому, и выясняется это через
 * сорок минут.
 *
 * Наряд закрывает именно этот разрыв и ничего больше. Он не считает
 * деньги, не влияет на зарплату и не появляется в отчётах — всё это
 * по-прежнему делает запись, которая создаётся в конце.
 */

/** Что происходит с нарядом. Порядок строгий, назад ходить нельзя. */
export type JobStatus = 'assigned' | 'accepted' | 'started' | 'done' | 'canceled';

/** Живые наряды — те, что ещё висят на мойщике. */
const OPEN: JobStatus[] = ['assigned', 'accepted', 'started'];

export type JobRow = {
  id: string;
  clientKey: string;
  staffId: string;
  staffName: string | null;
  serviceId: string | null;
  serviceName: string | null;
  note: string | null;
  status: JobStatus;
  createdAt: Date;
  acceptedAt: Date | null;
  startedAt: Date | null;
  /** сколько машина ждёт, минутами — по часам базы */
  waitedMinutes: number;
};

const shape = {
  id: jobs.id,
  clientKey: jobs.clientKey,
  staffId: jobs.staffId,
  staffName: users.name,
  serviceId: jobs.serviceId,
  serviceName: jobs.serviceName,
  note: jobs.note,
  status: sql<JobStatus>`${jobs.status}`,
  createdAt: jobs.createdAt,
  acceptedAt: jobs.acceptedAt,
  startedAt: jobs.startedAt,
  /* Считает база, а не страница. Во-первых, `Date.now()` во время
     отрисовки — обращение к часам машины, которая рисует: React такой
     вызов считает нечистым и правильно делает. Во-вторых, часы базы и
     есть те часы, по которым проставлено время приёма, и разница между
     ними всегда честная. */
  waitedMinutes: sql<number>`floor(extract(epoch from (now() - ${jobs.createdAt})) / 60)::int`,
};

/**
 * Принять машину и отдать её мойщику.
 *
 * Мойщик и услуга проверяются на принадлежность мойке: Server Action
 * можно позвать напрямую и подставить чужой идентификатор.
 *
 * Название услуги пишется снимком — по той же причине, что и в записи:
 * прайс завтра переименуют, а наряд обязан помнить, о чём договорились
 * с клиентом сегодня.
 */
export async function assignJob(input: {
  tenantId: string;
  byUserId: string;
  clientKey: string;
  staffId: string;
  serviceId?: string | null;
  note?: string | null;
}): Promise<JobRow> {
  const key = normalizeClientKey(input.clientKey);
  if (!key) throw new NotFoundError('EMPTY_CLIENT_KEY');

  const [staff] = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(
      and(eq(users.tenantId, input.tenantId), eq(users.id, input.staffId), eq(users.active, true)),
    );
  if (!staff) throw new NotFoundError('STAFF_NOT_FOUND');

  let serviceId: string | null = null;
  let serviceName: string | null = null;
  if (input.serviceId) {
    const [service] = await db
      .select({ id: services.id, name: services.name })
      .from(services)
      .where(and(eq(services.tenantId, input.tenantId), eq(services.id, input.serviceId)));
    if (!service) throw new NotFoundError('SERVICE_NOT_FOUND');
    serviceId = service.id;
    serviceName = service.name;
  }

  const [made] = await db
    .insert(jobs)
    .values({
      tenantId: input.tenantId,
      clientKey: key,
      staffId: staff.id,
      assignedBy: input.byUserId,
      serviceId,
      serviceName,
      note: input.note?.trim() || null,
      status: 'assigned',
    })
    .returning({ id: jobs.id, createdAt: jobs.createdAt });

  /* Уведомление адресное и уходит в фоне: наряд обязан создаться, даже
     если Apple сейчас недоступна. */
  notifyUserInBackground(input.tenantId, staff.id, input.byUserId, {
    title: 'Ձեզ նոր մեքենա է հանձնարարված',
    body: serviceName ? `${key} · ${serviceName}` : key,
    thread: 'jobs',
  });

  return {
    id: made.id,
    clientKey: key,
    staffId: staff.id,
    staffName: staff.name,
    serviceId,
    serviceName,
    note: input.note?.trim() || null,
    status: 'assigned',
    createdAt: made.createdAt,
    acceptedAt: null,
    startedAt: null,
    // машину только что приняли — ждать она ещё не начала
    waitedMinutes: 0,
  };
}

/**
 * Мойщик берёт машину.
 *
 * Двигать наряд может только тот, кому он назначен. Владелец делает это
 * за него, когда мойщик без телефона, — но тогда он и отвечает за то,
 * что машину действительно взяли.
 *
 * Переход пишется условием прямо в UPDATE: два нажатия подряд с
 * дрожащей рукой не должны переписать время начала.
 */
export async function acceptJob(tenantId: string, jobId: string, byUserId: string, isOwner = false) {
  const now = new Date();
  const [row] = await db
    .update(jobs)
    .set({ status: 'accepted', acceptedAt: now })
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        eq(jobs.id, jobId),
        eq(jobs.status, 'assigned'),
        isOwner ? undefined : eq(jobs.staffId, byUserId),
      ),
    )
    .returning({ id: jobs.id });

  if (!row) throw new NotFoundError('JOB_NOT_FOUND');
  return row.id;
}

/**
 * Мойщик начал мыть.
 *
 * Разрешаем и из «взял», и сразу из «назначено»: человек с мокрыми
 * руками жмёт одну кнопку, а не две подряд, и заставлять его сначала
 * подтверждать, что он увидел машину, — бюрократия. Время «взял» в
 * таком случае проставляется тем же моментом, иначе очередь покажет
 * пустой промежуток.
 */
export async function startJob(tenantId: string, jobId: string, byUserId: string, isOwner = false) {
  const now = new Date();
  const [row] = await db
    .update(jobs)
    /* Дата внутрь сырого `sql` уходит строкой с явным типом: объект
       `Date` в этой позиции драйвер не умеет сериализовать и роняет
       запрос целиком — «Received an instance of Date». */
    .set({
      status: 'started',
      startedAt: now,
      acceptedAt: sql`coalesce(${jobs.acceptedAt}, ${now.toISOString()}::timestamptz)`,
    })
    .where(
      and(
        eq(jobs.tenantId, tenantId),
        eq(jobs.id, jobId),
        inArray(jobs.status, ['assigned', 'accepted']),
        isOwner ? undefined : eq(jobs.staffId, byUserId),
      ),
    )
    .returning({ id: jobs.id });

  if (!row) throw new NotFoundError('JOB_NOT_FOUND');
  return row.id;
}

/* Наряд закрывает запись, и делает это `createOrder` в своей
   транзакции — см. `lib/orders.ts`. Здесь такой функции нет намеренно:
   она тут была, её никто не вызывал, и мёртвый код создавал полную
   уверенность, что закрытие работает. Держать её обёрткой поверх
   настоящего закрытия тоже нельзя — `lib/jobs.ts` берёт из `orders.ts`
   свою ошибку, и обратный импорт замкнул бы модули друг на друга. */

/** Машина уехала, не дождавшись. Отменяет владелец. */
export async function cancelJob(tenantId: string, jobId: string) {
  const [row] = await db
    .update(jobs)
    .set({ status: 'canceled', canceledAt: new Date() })
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId), inArray(jobs.status, OPEN)))
    .returning({ id: jobs.id });

  if (!row) throw new NotFoundError('JOB_NOT_FOUND');
  return row.id;
}

/**
 * Очередь мойки — то, что владелец видит в кабинете.
 *
 * Порядок по времени приёма, а не по статусу: очередь есть очередь, и
 * машина, которая стоит дольше всех, обязана быть первой строкой, в
 * каком бы состоянии она ни была.
 */
export async function listOpenJobs(tenantId: string): Promise<JobRow[]> {
  return db
    .select(shape)
    .from(jobs)
    .leftJoin(users, eq(users.id, jobs.staffId))
    .where(and(eq(jobs.tenantId, tenantId), inArray(jobs.status, OPEN)))
    .orderBy(asc(jobs.createdAt));
}

/** Машины одного мойщика — то, что он видит на своём экране. */
export async function listMyJobs(tenantId: string, userId: string): Promise<JobRow[]> {
  return db
    .select(shape)
    .from(jobs)
    .leftJoin(users, eq(users.id, jobs.staffId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.staffId, userId), inArray(jobs.status, OPEN)))
    .orderBy(asc(jobs.createdAt));
}

/** Один наряд по идентификатору — для записи, которая его закрывает. */
export async function getJob(tenantId: string, jobId: string): Promise<JobRow | null> {
  const [row] = await db
    .select(shape)
    .from(jobs)
    .leftJoin(users, eq(users.id, jobs.staffId))
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.id, jobId), isNull(jobs.canceledAt)));
  return row ?? null;
}
