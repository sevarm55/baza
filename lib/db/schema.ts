import {
  pgTable,
  text,
  integer,
  boolean,
  uuid,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/* ---------------------------------------------------------------------------
   Мультитенантность
   Один сервер обслуживает много бизнесов. tenant_id есть на каждой таблице
   и подставляется в КАЖДЫЙ запрос слоем доступа к данным (lib/db/scope.ts).
   Прямых запросов к db из компонентов быть не должно — только через scope.
--------------------------------------------------------------------------- */

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** ключ из lib/niches.ts — нужен только для сидинга и дефолтов */
  niche: text('niche').notNull(),
  currency: text('currency').notNull().default('AMD'),
  locale: text('locale').notNull().default('hy'),
  timezone: text('timezone').notNull().default('Asia/Yerevan'),

  /** термины бизнеса — копируются из конфига ниши, дальше владелец правит */
  clientIdLabel: text('client_id_label').notNull(),
  clientIdType: text('client_id_type').notNull(), // plate | phone
  staffRole: text('staff_role').notNull(),
  unitOne: text('unit_one').notNull(),

  plan: text('plan').notNull().default('trial'), // trial | active
  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  /** до какой даты оплачено; на старте проставляется вручную */
  paidUntil: timestamp('paid_until', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** телефон в E.164, уникален глобально: один номер = один аккаунт */
    phone: text('phone').notNull(),
    pinHash: text('pin_hash').notNull(),
    name: text('name').notNull(),
    role: text('role').notNull().default('staff'), // owner | staff
    /** процент исполнителя на СЕГОДНЯ; в заказ пишется снимок */
    percent: integer('percent').notNull().default(0),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('users_phone_uniq').on(t.phone),
    index('users_tenant_idx').on(t.tenantId),
  ],
);

export const services = pgTable(
  'services',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** цена в минимальных единицах валюты (для AMD — драмы) */
    price: integer('price').notNull(),
    sort: integer('sort').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [index('services_tenant_idx').on(t.tenantId)],
);

export const clients = pgTable(
  'clients',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** номер машины или телефон — то, что вводит сотрудник */
    key: text('key').notNull(),
    name: text('name'),
    note: text('note'),
    /** денормализация ради скорости экрана клиентов; пересчитывается при записи */
    visits: integer('visits').notNull().default(0),
    total: integer('total').notNull().default(0),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('clients_tenant_key_uniq').on(t.tenantId, t.key),
    index('clients_last_seen_idx').on(t.tenantId, t.lastSeenAt),
  ],
);

/**
 * Абонемент: «10 моек по цене 8».
 *
 * Деньги приходят один раз — в момент продажи. Каждое последующее
 * использование выручку НЕ создаёт, иначе одни и те же деньги посчитаются
 * дважды. Но мойщик машину помыл, и его процент считается от unitPrice —
 * номинальной стоимости одной мойки внутри абонемента.
 */
export const passes = pgTable(
  'passes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id')
      .notNull()
      .references(() => clients.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    /** снимок: услугу могут переименовать или убрать из прайса */
    serviceName: text('service_name').notNull(),

    totalUses: integer('total_uses').notNull(),
    usedUses: integer('used_uses').notNull().default(0),

    /** сколько клиент заплатил за весь абонемент */
    price: integer('price').notNull(),
    /** цена одной мойки внутри абонемента — база для зарплаты мойщика */
    unitPrice: integer('unit_price').notNull(),

    soldBy: uuid('sold_by').references(() => users.id, { onDelete: 'set null' }),
    soldAt: timestamp('sold_at', { withTimezone: true }).notNull().defaultNow(),
    /** null — бессрочный */
    expiresAt: timestamp('expires_at', { withTimezone: true }),
  },
  (t) => [
    index('passes_tenant_idx').on(t.tenantId, t.soldAt),
    index('passes_client_idx').on(t.clientId),
  ],
);

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').references(() => clients.id, { onDelete: 'set null' }),
    staffId: uuid('staff_id').references(() => users.id, { onDelete: 'set null' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),

    /* СНИМКИ на момент записи.
       Владелец может завтра поднять цену или сменить процент — прошлые
       зарплаты и отчёты обязаны остаться прежними. Без этих трёх полей
       любое изменение настроек молча переписывает историю. */
    serviceName: text('service_name').notNull(),
    price: integer('price').notNull(),
    staffPercent: integer('staff_percent').notNull(),

    payment: text('payment').notNull(), // cash | card | transfer | pass
    /** заполнено, если списали с абонемента */
    passId: uuid('pass_id').references(() => passes.id, { onDelete: 'set null' }),
    note: text('note'),

    /* Идентификатор, который придумал телефон мойщика.
       Без связи запись копится локально и досылается потом — возможно,
       несколько раз. Уникальность по (tenant, ref) превращает повторную
       отправку в безопасную операцию вместо второй машины в отчёте. */
    clientRef: text('client_ref'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** мягкая отмена: запись остаётся в истории, но не считается */
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
  },
  (t) => [
    // NULL-значения в Postgres не конфликтуют, поэтому старые записи
    // без ref спокойно сосуществуют
    uniqueIndex('orders_client_ref_uniq').on(t.tenantId, t.clientRef),
    index('orders_tenant_created_idx').on(t.tenantId, t.createdAt),
    index('orders_staff_idx').on(t.tenantId, t.staffId, t.createdAt),
    index('orders_client_idx').on(t.clientId),
  ],
);

export const payouts = pgTable(
  'payouts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    periodFrom: timestamp('period_from', { withTimezone: true }).notNull(),
    periodTo: timestamp('period_to', { withTimezone: true }).notNull(),
    amount: integer('amount').notNull(),
    paidAt: timestamp('paid_at', { withTimezone: true }).notNull().defaultNow(),
    paidBy: uuid('paid_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('payouts_tenant_idx').on(t.tenantId, t.staffId)],
);

/** Кто что поправил. Нужен ровно для одного вопроса владельца: «а кто удалил запись?» */
export const audit = pgTable(
  'audit',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(), // create | update | cancel | payout
    entity: text('entity').notNull(), // order | service | user | ...
    entityId: uuid('entity_id'),
    data: jsonb('data'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('audit_tenant_idx').on(t.tenantId, t.createdAt)],
);

export type Tenant = typeof tenants.$inferSelect;
export type User = typeof users.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Pass = typeof passes.$inferSelect;
