import type { Tenant } from './db/schema';

/**
 * Состояние подписки.
 *
 * Различаем две очень разные ситуации:
 *
 *   срок вышел  — человек забыл заплатить. Блокировка мягкая: он видит
 *                 свои цифры, историю и выгрузку, закрыта только запись
 *                 новой работы. Отбирать данные за просрочку — верный
 *                 способ, чтобы он не вернулся.
 *
 *   отключён    — решение владельца продукта: не платит и не собирается.
 *                 Вход закрыт целиком. Данные остаются в базе: заплатит —
 *                 включим обратно, и всё будет на месте.
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
 * Пока платящих клиентов нет, счётчик триала только мешает: он выключит
 * собственную демонстрацию посреди разговора с мойкой. Включается
 * переменной BILLING_ENABLED=1, когда придёт время брать деньги.
 *
 * Ручное отключение бизнеса работает всегда: это не про оплату,
 * а про возможность закрыть доступ.
 */
export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === '1';
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

  return { state: 'expired', daysLeft: 0, canRead: true, canWrite: false, warn: true };
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
