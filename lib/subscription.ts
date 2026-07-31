import type { Tenant } from './db/schema';

/**
 * Состояние подписки.
 *
 * Различаем две очень разные ситуации:
 *
 *   срок вышел  — человек забыл заплатить. Доступ закрыт: вместо
 *                 разделов один экран с тем, что делать дальше.
 *
 *   отключён    — решение владельца продукта: не платит и не собирается.
 *                 Тот же экран.
 *
 * Разница между ними осталась только в словах на этом экране. Данные в
 * обоих случаях целы, и забрать их можно всегда: выгрузка и удаление
 * аккаунта не смотрят на состояние счёта. Отбирать историю за неуплату —
 * верный способ, чтобы человек не вернулся даже заплатив.
 */

export type Access = {
  state: 'trial' | 'active' | 'expired' | 'blocked';
  /** сколько дней осталось; 0 если срок вышел */
  daysLeft: number;
  /** пускать ли в приложение вообще */
  canRead: boolean;
  /** можно ли записывать новую работу */
  canWrite: boolean;
  /** пора показать напоминание */
  warn: boolean;
};

/** За сколько дней до конца начинаем напоминать. */
const WARN_DAYS = 5;

/**
 * Оплата продукта — часть модели, поэтому включена по умолчанию.
 * Выключается только явно: BILLING_ENABLED=0. Пригодится, если нужно
 * показать продукт без тикающего срока.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED !== '0';
}

/**
 * Доступ с учётом того, включена ли вообще оплата.
 * Экраны спрашивают именно это, а accessOf остаётся чистым расчётом
 * состояния подписки — его удобно проверять тестами.
 */
export function currentAccess(
  tenant: Pick<Tenant, 'plan' | 'trialEndsAt' | 'paidUntil'>,
  now: Date = new Date(),
): Access {
  if (tenant.plan === 'blocked') return accessOf(tenant, now);

  if (!billingEnabled()) {
    return { state: 'active', daysLeft: 0, canRead: true, canWrite: true, warn: false };
  }
  return accessOf(tenant, now);
}

export function accessOf(
  tenant: Pick<Tenant, 'plan' | 'trialEndsAt' | 'paidUntil'>,
  now: Date = new Date(),
): Access {
  if (tenant.plan === 'blocked') {
    return { state: 'blocked', daysLeft: 0, canRead: false, canWrite: false, warn: true };
  }

  const paidLeft = daysBetween(now, tenant.paidUntil);
  if (tenant.plan === 'active' && paidLeft > 0) {
    return {
      state: 'active',
      daysLeft: paidLeft,
      canRead: true,
      canWrite: true,
      warn: paidLeft <= WARN_DAYS,
    };
  }

  const trialLeft = daysBetween(now, tenant.trialEndsAt);
  if (trialLeft > 0) {
    return { state: 'trial', daysLeft: trialLeft, canRead: true, canWrite: true, warn: true };
  }

  /* Просрочка закрывает доступ целиком, а не только запись.
     Мягкая блокировка выглядела невнятно: продукт говорил «срок вышел» и
     при этом позволял ходить по разделам и заводить людей. Человек не
     понимал, кончилось у него что-то или нет.
     Данные при этом никуда не деваются: выгрузка и удаление аккаунта
     работают в любом состоянии счёта — см. anyPlan в lib/api/guard.ts. */
  return { state: 'expired', daysLeft: 0, canRead: false, canWrite: false, warn: true };
}

/** Дней осталось, округляя вверх: последний день должен считаться днём. */
function daysBetween(now: Date, until: Date | null): number {
  if (!until) return 0;
  const ms = until.getTime() - now.getTime();
  return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

export class SubscriptionExpiredError extends Error {
  constructor() {
    super('SUBSCRIPTION_EXPIRED');
  }
}
