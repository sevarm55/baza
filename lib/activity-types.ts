/**
 * Типы живой ленты без единого импорта базы.
 *
 * Этим файлом пользуется и браузер (строки ленты, фильтры), и сервер.
 * Сам `lib/activity.ts` тянет за собой драйвер Postgres, и клиентскому
 * компоненту его импортировать нельзя: сборка упадёт на `fs`.
 */
export type ActivityType =
  | 'shift.started'
  | 'shift.finished'
  | 'car.created'
  | 'car.updated'
  | 'car.canceled'
  | 'expense.created'
  | 'expense.updated'
  | 'expense.deleted'
  | 'employee.created'
  | 'employee.updated'
  | 'employee.removed'
  | 'salary.changed'
  | 'service.created'
  | 'service.updated'
  | 'service.archived'
  | 'client.created'
  | 'payout.made'
  | 'pass.sold'
  | 'settings.changed';

export type ActivityEntity =
  | 'shift'
  | 'car'
  | 'expense'
  | 'employee'
  | 'service'
  | 'client'
  | 'payout'
  | 'pass'
  | 'settings';

export type ActorRole = 'owner' | 'staff' | 'system';

/** Группы событий: ими фильтруют ленту и красят значок. */
export type ActivityGroup = 'cars' | 'shifts' | 'money' | 'team' | 'catalog' | 'clients';

export const GROUP_OF: Record<ActivityType, ActivityGroup> = {
  'shift.started': 'shifts',
  'shift.finished': 'shifts',
  'car.created': 'cars',
  'car.updated': 'cars',
  'car.canceled': 'cars',
  'expense.created': 'money',
  'expense.updated': 'money',
  'expense.deleted': 'money',
  'employee.created': 'team',
  'employee.updated': 'team',
  'employee.removed': 'team',
  'salary.changed': 'team',
  'service.created': 'catalog',
  'service.updated': 'catalog',
  'service.archived': 'catalog',
  'client.created': 'clients',
  'payout.made': 'money',
  'pass.sold': 'money',
  'settings.changed': 'catalog',
};

export const ENTITY_OF: Record<ActivityType, ActivityEntity> = {
  'shift.started': 'shift',
  'shift.finished': 'shift',
  'car.created': 'car',
  'car.updated': 'car',
  'car.canceled': 'car',
  'expense.created': 'expense',
  'expense.updated': 'expense',
  'expense.deleted': 'expense',
  'employee.created': 'employee',
  'employee.updated': 'employee',
  'employee.removed': 'employee',
  'salary.changed': 'employee',
  'service.created': 'service',
  'service.updated': 'service',
  'service.archived': 'service',
  'client.created': 'client',
  'payout.made': 'payout',
  'pass.sold': 'pass',
  'settings.changed': 'settings',
};

/** Что можно положить в событие. Закрытый список: секретам здесь негде лечь. */
export type ActivityData = {
  /** номер машины или ключ клиента */
  key?: string;
  /** название услуги (или услуг через « + ») */
  service?: string;
  /** сумма в минимальных единицах валюты бизнеса */
  amount?: number;
  /** цена по прайсу, когда взяли меньше */
  listPrice?: number;
  /** способ оплаты: cash | card | transfer | pass */
  payment?: string;
  /** прежний способ оплаты при смене */
  paymentFrom?: string;
  /** категория расхода */
  category?: string;
  /** имя сотрудника или клиента, о ком событие */
  name?: string;
  /** имена участников совместной мойки */
  crew?: string[];
  /** процент: новый */
  percent?: number;
  /** процент: прежний */
  percentFrom?: number;
  /** расход постоянный (в месяц) */
  monthly?: boolean;
  /** наличных ожидалось при закрытии смены */
  cashExpected?: number;
  /** наличных сдано */
  cashDeclared?: number | null;
  /** что именно поменяли в настройках: business | teamPercent | tiers */
  what?: string;
  /** уточнение для car.updated: crew | payment */
  change?: string;
  /** число машин за смену */
  count?: number;
};

/** Строка ленты в том виде, в каком она уезжает в браузер и в приложение. */
export type ActivityRow = {
  id: string;
  type: ActivityType;
  entity: ActivityEntity;
  entityId: string | null;
  actorId: string | null;
  actorName: string | null;
  actorRole: ActorRole;
  data: ActivityData;
  /** ISO, чтобы пережить границу сервер-браузер без потери зоны */
  at: string;
};

