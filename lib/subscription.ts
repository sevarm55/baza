import type { Tenant } from './db/schema';

/**
 * Состояние подписки.
 *
 * Блокировка мягкая: когда срок вышел, бизнес по-прежнему видит свои
 * цифры, историю и выгрузку — закрывается только запись новых машин.
 * Отбирать у человека его собственные данные нельзя: это худший способ
 * попрощаться с клиентом, и он не вернётся.
 */

export type Access = {
  state: 'trial' | 'active' | 'expired';
  /** сколько дней осталось; 0 если срок вышел */
  daysLeft: number;
  /** можно ли записывать новую работу */
  canWrite: boolean;
  /** пора показать напоминание */
  warn: boolean;
};

/** За сколько дней до конца начинаем напоминать. */
const WARN_DAYS = 5;

export function accessOf(
  tenant: Pick<Tenant, 'plan' | 'trialEndsAt' | 'paidUntil'>,
  now: Date = new Date(),
): Access {
  const paidLeft = daysBetween(now, tenant.paidUntil);
  if (tenant.plan === 'active' && paidLeft > 0) {
    return {
      state: 'active',
      daysLeft: paidLeft,
      canWrite: true,
      warn: paidLeft <= WARN_DAYS,
    };
  }

  const trialLeft = daysBetween(now, tenant.trialEndsAt);
  if (trialLeft > 0) {
    return { state: 'trial', daysLeft: trialLeft, canWrite: true, warn: true };
  }

  return { state: 'expired', daysLeft: 0, canWrite: false, warn: true };
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
