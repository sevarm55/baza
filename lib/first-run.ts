import { and, count, desc, eq, isNull } from 'drizzle-orm';
import { db } from './db';
import { clients, expenses, orders, users } from './db/schema';
import type { Membership, Tenant } from './db/schema';
import {
  firstRunActive,
  stageAtLeast,
  stageIndex,
  type FirstRunStage,
} from './first-run-stage';

/**
 * Сценарий первого запуска.
 *
 * Не тур и не чек-лист: новый владелец один раз проходит настоящий цикл
 * продукта — подтверждает прайс, записывает расход, заводит работника,
 * смотрит на Tetrin его глазами, добавляет первую машину и возвращается
 * к себе, где эта машина уже лежит в журнале. Все данные по пути
 * настоящие: услуги, расход, работник и машина остаются в бизнесе после
 * сценария, потому что создаются тем же доменным слоем, что и всегда.
 *
 * Позиция хранится одной строкой на участии (`users.onboarding_stage`),
 * но данные бизнеса остаются первичными: перед показом каждого экрана
 * позиция сверяется с ними здесь. Шаг, чьи данные уже есть, не
 * повторяется — расход, добавленный с телефона посреди сценария, честно
 * закрывает шаг расхода; бизнес, у которого уже есть записи, сценарий
 * не мучает вовсе.
 */

/** Что показать человеку, открывшему /onboarding. */
export type FirstRunView =
  /** сценарий не идёт: в обычный кабинет */
  | { kind: 'owner' }
  /** шаг 1: подтвердить услуги и цены */
  | { kind: 'services' }
  /** шаг 2: первый расход */
  | { kind: 'expense' }
  /** шаг 3: завести работника */
  | { kind: 'staff' }
  /** шаг 4: карточка работника и вход в его режим; `again` — превью уже
   *  начиналось, но машины пока нет: слова другие, действие то же */
  | { kind: 'meet'; worker: FirstRunWorker; again: boolean }
  /** финал: машина записана, показать её владельцу */
  | { kind: 'finale'; worker: FirstRunWorker | null; order: FirstRunOrder };

export type FirstRunWorker = { id: string; name: string; phone: string };

export type FirstRunOrder = {
  id: string;
  serviceName: string;
  price: number;
  payment: string;
  createdAt: Date;
  clientKey: string | null;
  authorName: string | null;
};

/**
 * Сдвинуть позицию сценария — только вперёд.
 *
 * Назад не бывает по той же причине, по которой его нет у данных:
 * добавленная услуга не исчезает от перезагрузки. Участию без сценария
 * (NULL) позиция не заводится никогда: это существующие аккаунты, и
 * показать им обучение первого дня значило бы объяснять людям их же
 * бизнес.
 */
export async function setFirstRunStage(
  uid: string,
  tid: string,
  stage: FirstRunStage,
): Promise<void> {
  const [me] = await db
    .select({ stage: users.onboardingStage })
    .from(users)
    .where(and(eq(users.id, uid), eq(users.tenantId, tid)));

  if (!me || me.stage === null) return;
  if (stageIndex(stage) <= stageIndex(me.stage)) return;

  await db
    .update(users)
    .set({ onboardingStage: stage })
    .where(and(eq(users.id, uid), eq(users.tenantId, tid)));
}

/** Последний заведённый работник — тот, кого показывает сценарий. */
export async function firstRunWorker(tenantId: string): Promise<FirstRunWorker | null> {
  const [row] = await db
    .select({ id: users.id, name: users.name, phone: users.phone })
    .from(users)
    .where(and(eq(users.tenantId, tenantId), eq(users.role, 'staff'), eq(users.active, true)))
    .orderBy(desc(users.createdAt))
    .limit(1);
  return row ?? null;
}

/** Свежайшая запись бизнеса — её показывает финал. */
async function latestOrder(tenantId: string): Promise<FirstRunOrder | null> {
  const [row] = await db
    .select({
      id: orders.id,
      serviceName: orders.serviceName,
      price: orders.price,
      payment: orders.payment,
      createdAt: orders.createdAt,
      clientKey: clients.key,
      authorName: users.name,
    })
    .from(orders)
    .leftJoin(clients, eq(clients.id, orders.clientId))
    .leftJoin(users, eq(users.id, orders.staffId))
    .where(and(eq(orders.tenantId, tenantId), isNull(orders.canceledAt)))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Сверить позицию с данными бизнеса и решить, какой экран показывать.
 *
 * Правила простые и в одну сторону:
 *  - записи уже есть, а человек ещё в настройке — бизнес работает,
 *    сценарий закрывается: учить нечему;
 *  - расход уже есть — шаг расхода пройден, чей бы он ни был;
 *  - работник уже есть — шаг найма пройден, показываем его карточку;
 *  - после входа в режим работника появилась запись — это финал.
 *
 * Каждый такой вывод записывается в позицию: правда, которую вывели из
 * данных, не должна пересчитываться при каждом обновлении страницы.
 */
export async function resolveFirstRun(tenant: Tenant, me: Membership): Promise<FirstRunView> {
  const stage = me.onboardingStage;
  if (!firstRunActive(stage)) return { kind: 'owner' };

  const move = async (next: FirstRunStage) => setFirstRunStage(me.id, tenant.id, next);

  const [made] = await db
    .select({ n: count() })
    .from(orders)
    .where(eq(orders.tenantId, tenant.id));
  const recorded = made?.n ?? 0;

  /* До шага работника любая запись означает работающий бизнес: сюда
     попадают владельцы, начавшие в приложении и открывшие веб позже.
     Отменённые считаются тоже — вопрос «умеет ли мойка записывать»,
     а не «сколько заработала». */
  if (recorded > 0 && !stageAtLeast(stage, 'staff')) {
    await move('done');
    return { kind: 'owner' };
  }

  if (stage === 'new') return { kind: 'services' };

  if (stage === 'services') {
    const [spent] = await db
      .select({ n: count() })
      .from(expenses)
      .where(eq(expenses.tenantId, tenant.id));
    if ((spent?.n ?? 0) === 0) return { kind: 'expense' };
    await move('expense');
  }

  const worker = await firstRunWorker(tenant.id);

  if (!stageAtLeast(stage, 'staff')) {
    if (!worker) return { kind: 'staff' };
    await move('staff');
  }

  /* Работника не стало посреди сценария — например, убрали с телефона.
     Позиция назад не двигается, но экран честно возвращается к найму:
     смотреть глазами некого. */
  if (!worker && recorded === 0) return { kind: 'staff' };

  if (recorded > 0) {
    const order = await latestOrder(tenant.id);
    if (order) {
      await move('car');
      return { kind: 'finale', worker, order };
    }
    /* Записи есть, но все отменены — финалу нечего показать; живём как
       будто машины ещё не было. */
  }

  if (!worker) return { kind: 'staff' };
  return { kind: 'meet', worker, again: stageAtLeast(stage, 'preview') };
}
