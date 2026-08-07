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
import { sql } from 'drizzle-orm';

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
  /* Заметка платформы о клиенте: «договорились на 12 000», «платит
     пятого», «брат Ашота». Держать это в голове получается до десятка
     клиентов, дальше нет. Владельцу бизнеса не видна — она наша. */
  adminNote: text('admin_note'),
  clientIdType: text('client_id_type').notNull(), // plate | phone
  staffRole: text('staff_role').notNull(),
  unitOne: text('unit_one').notNull(),

  /* Тарифные варианты: у мойки это класс машины (седан, кроссовер, джип),
     у другой ниши — что угодно или ничего.

     Пусто — свойства нет вовсе, и всё работает как раньше: у услуги одна
     цена. Это важнее, чем кажется: продукт мультинишевый, и «класс машины»
     нельзя зашивать ни в схему, ни в интерфейс. Здесь только СПИСОК СЛОВ,
     которые владелец придумал сам, и слово, которым он их называет.

     Имена, а не справочник строкой в отдельной таблице: их три-четыре, они
     не имеют собственных свойств, и join ради трёх слов стоил бы дороже,
     чем даёт. */
  tierLabel: text('tier_label'),
  tiers: jsonb('tiers').$type<string[]>(),

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
    /**
     * Поколение сессий. Растёт при смене PIN и при «выйти везде»:
     * все выданные раньше токены сразу перестают действовать, не дожидаясь
     * своего срока. Без этого сменить PIN после кражи телефона бесполезно.
     */
    tokenVersion: integer('token_version').notNull().default(0),
    /**
     * Слать ли владельцу уведомление о каждой записи.
     *
     * Отдельно от уведомления об открытии смены: смен две в день, а машин
     * сорок. Одним выключателем на всё человек убил бы и то, что хотел
     * получать, — а выключают такое в настройках телефона целиком и
     * навсегда.
     */
    notifyOrders: boolean('notify_orders').notNull().default(true),
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
    /**
     * Цена в минимальных единицах валюты (для AMD — драмы).
     *
     * Остаётся ценой по умолчанию и ценой первого тарифа. Все прежние
     * запросы, отчёты и снимки продолжают читать её, ничего не зная про
     * тарифы, — поэтому включение тарифов не переписывает ни строчки
     * истории.
     */
    price: integer('price').notNull(),
    /**
     * Цены по тарифам, в том же порядке, что `tenants.tiers`.
     *
     * Короче списка тарифов или null — недостающие берутся из `price`.
     * Так добавление нового класса не ломает прайс: новый класс просто
     * стоит как базовый, пока владелец не назначит ему цену.
     */
    tierPrices: jsonb('tier_prices').$type<number[]>(),
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
    /**
     * Тариф на момент записи — СЛОВОМ, а не номером.
     *
     * Номер указывал бы в список, который владелец завтра переставит
     * местами или переименует, и вся история молча стала бы врать. Слово
     * не зависит ни от чего: «Ջիպ» останется джипом, даже если этот класс
     * потом уберут из прайса.
     */
    tier: text('tier'),
    /** сколько взяли на самом деле — из неё считаются выручка и процент */
    price: integer('price').notNull(),
    /**
     * Цена по прайсу на момент записи. Null — старые записи, где скидок
     * ещё не было; для них цена по прайсу равна взятой.
     *
     * Нужна, чтобы скидка была видна. Без неё продукт видел бы только
     * «помыли за 4 000» и не отличал бы дешёвую услугу от скидки на
     * дорогую — а это два разных разговора с работником.
     *
     * Процент исполнителя считается от взятой цены, а не от прайсовой:
     * иначе скидка стоила бы владельцу дважды — и в выручке, и в
     * зарплате.
     */
    listPrice: integer('list_price'),
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

/**
 * Услуги внутри одной записи.
 *
 * За один заезд делают комплекс и химчистку салона. Пока услуга была
 * одна, это записывали двумя машинами — и врали три числа из четырёх:
 * машин «2» вместо одной, средний чек вдвое ниже, в истории клиента два
 * визита. Верной оставалась только выручка.
 *
 * Итоги при этом остались на самой записи: `orders.price` — сколько
 * взяли, `orders.listPrice` — сколько стоило по прайсу. Так выручка,
 * зарплата и выгрузка считаются ровно как раньше, а строки добавляют
 * подробность, которой не было.
 *
 * Скидка живёт на записи, а не на строке: на мойке торгуются за счёт
 * целиком — «комплекс с химчисткой, отдам за пятнадцать», — а не за
 * отдельную услугу в нём.
 */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    serviceId: uuid('service_id').references(() => services.id, { onDelete: 'set null' }),
    /** снимок: услугу могут переименовать или убрать из прайса */
    serviceName: text('service_name').notNull(),
    /** цена этой услуги по прайсу на момент записи */
    price: integer('price').notNull(),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [
    index('order_items_order_idx').on(t.orderId),
    index('order_items_tenant_idx').on(t.tenantId, t.serviceId),
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

/**
 * Сессия = устройство, с которого вошли.
 *
 * Нужна ради одного: возможности выключить доступ немедленно. Раньше токен
 * жил 30 дней и действовал до конца срока — украли телефон, и сделать было
 * нечего. Теперь в токене лежит `sid`, и строка отсюда решает, жив он ещё
 * или нет.
 *
 * Приложению та же таблица служит хранилищем refresh-токена: в базе только
 * его хеш, как и у PIN. Веб refresh не использует — у него cookie, — но
 * отзывается ровно так же, поэтому «выйти на всех устройствах» работает
 * одинаково с обеих сторон.
 */
/**
 * Платежи за подписку — наши деньги, а не деньги мойки.
 *
 * До сих пор продление меняло дату и не оставляло следа: доступ
 * продлевался, а сколько за это заплатили — нигде. Через полгода на
 * вопрос «сколько я заработал в августе» ответить было нечем. Продукт,
 * который наводит учёт у автомоек, свой не вёл вовсе.
 *
 * Сумма пишется отдельно от числа месяцев: договариваются по-разному, и
 * «три месяца за 40 000 вместо 45 000» — обычное дело.
 */
export const platformPayments = pgTable(
  'platform_payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** в минимальных единицах, как и все деньги в продукте */
    amount: integer('amount').notNull(),
    /** на сколько месяцев продлили этим платежом */
    months: integer('months').notNull(),
    note: text('note'),
    /** кто принял платёж — админов может быть несколько */
    byUserId: uuid('by_user_id').references(() => users.id, { onDelete: 'set null' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('platform_payments_at_idx').on(t.at)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('web'), // web | app
    /** как показать устройство в списке: «iPhone Ашота» */
    device: text('device'),
    /** только для приложения; хеш, а не сам токен */
    refreshHash: text('refresh_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    index('sessions_user_idx').on(t.userId, t.revokedAt),
    index('sessions_tenant_idx').on(t.tenantId),
  ],
);

/**
 * Попытки входа — и удачные, и нет.
 *
 * PIN из четырёх цифр это 10 000 комбинаций: публичный эндпоинт без счётчика
 * перебирается за минуты. Считаем неудачи и по номеру, и по адресу: первое
 * защищает конкретного человека, второе — от перебора номеров подряд.
 *
 * Таблица, а не память процесса: память обнуляется при каждом деплое, то есть
 * ровно тогда, когда защита нужнее всего.
 */
export const loginAttempts = pgTable(
  'login_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** нормализованный E.164; может не соответствовать ни одному пользователю */
    phone: text('phone').notNull(),
    ip: text('ip'),
    ok: boolean('ok').notNull(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('login_attempts_phone_idx').on(t.phone, t.at),
    index('login_attempts_ip_idx').on(t.ip, t.at),
  ],
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

/**
 * Расходы.
 *
 * Без них продукт считает только приход, а владелец спрашивает не
 * «сколько намыли», а «сколько осталось». Половина расходной части уже
 * была в системе — зарплата считается из снимков процента в записях;
 * здесь появляется вторая.
 *
 * Два вида, и разница между ними принципиальная.
 *
 *   разовый     — химия, ремонт, инструмент. Случился в конкретный день,
 *                 в этот день и падает.
 *
 *   постоянный  — аренда, свет, интернет. Платится раз в месяц, но
 *                 относится ко всем дням месяца сразу. Если положить его
 *                 одним днём, прибыль за первое число уйдёт в минус на
 *                 полгорода, а за второе будет враньём в другую сторону.
 *                 Поэтому постоянный расход размазывается по дням.
 */
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    /** в минимальных единицах валюты — как и цены услуг */
    amount: integer('amount').notNull(),
    /** «Քիմիա», «Վարձ» — свободная строка, в интерфейсе есть подсказки */
    category: text('category').notNull(),
    note: text('note'),
    /** ежемесячный (аренда) или разовый (канистра химии) */
    monthly: boolean('monthly').notNull().default(false),
    /** разовый: когда потрачено. постоянный: с какого дня действует */
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    /**
     * Когда постоянный расход перестал действовать.
     *
     * Постоянные не удаляются, а закрываются этой датой: аренда выросла —
     * старую закрыли, новую завели. Иначе правка суммы задним числом
     * переписала бы прибыль за все прошлые месяцы, и цифра, на которую
     * владелец однажды посмотрел, перестала бы существовать.
     */
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('expenses_tenant_idx').on(t.tenantId, t.at)],
);

/**
 * Смены.
 *
 * До сих пор «смена» была не сущностью, а выборкой: записи сотрудника с
 * начала дня. Этого хватало, чтобы посчитать заработок, и не хватало,
 * чтобы ответить на вопрос владельца «кто сейчас на мойке» — по записям
 * видно только тех, кто уже успел что-то намыть.
 *
 * Открывает и закрывает сам работник, переключателем на своём экране.
 * Открытая смена — это `closedAt is null`, и такая у человека может быть
 * только одна: частичный уникальный индекс не даст завести вторую даже
 * при двойном нажатии или досылке из очереди.
 */
export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    openedAt: timestamp('opened_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),

    /**
     * Сколько наличных человек сказал, что сдал. Null — не отмечал.
     *
     * Продукт знал, сколько намыто наличными, и не знал, сколько из них
     * дошло до владельца. Разница между этими числами и есть недостача —
     * то, ради чего в кассовом бизнесе вообще ставят учёт.
     *
     * Заполнять необязательно: заставить — значит запереть человека в
     * приложении в конце смены, а закрыться он должен уметь всегда.
     */
    cashDeclared: integer('cash_declared'),

    /**
     * Сколько наличных было намыто к моменту закрытия — снимок.
     *
     * Именно снимок, а не пересчёт: отменённая назавтра запись изменила
     * бы ожидаемую сумму, и вчерашняя недостача поменялась бы задним
     * числом. Тот же принцип, что у цены и процента в записи.
     */
    cashExpected: integer('cash_expected'),
  },
  (t) => [
    index('shifts_tenant_idx').on(t.tenantId, t.openedAt),
    uniqueIndex('shifts_open_uniq')
      .on(t.userId)
      .where(sql`${t.closedAt} is null`),
  ],
);

/**
 * Токены устройств для пуш-уведомлений.
 *
 * Токен принадлежит паре «человек + устройство»: у владельца может быть
 * телефон и планшет, и уведомление должно прийти на оба. Уникальность по
 * самому токену, а не по пользователю, — иначе переустановка приложения
 * оставила бы в базе мёртвую запись, а Apple на неё отвечает 410, и мы
 * молча теряли бы доставку.
 *
 * `sandbox` не роскошь: сборка из Xcode получает токен тестового контура
 * Apple, магазинная — боевого, и хосты у них разные. Отправить в не тот
 * контур значит получить BadDeviceToken на исправном токене.
 */
export const pushTokens = pgTable(
  'push_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    sandbox: boolean('sandbox').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    seenAt: timestamp('seen_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('push_tokens_uniq').on(t.token), index('push_tokens_user_idx').on(t.userId)],
);

export type Tenant = typeof tenants.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type Shift = typeof shifts.$inferSelect;
export type PushToken = typeof pushTokens.$inferSelect;
export type User = typeof users.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Pass = typeof passes.$inferSelect;
export type Session = typeof sessions.$inferSelect;
