import { PERIOD_KEYS, type PeriodKey } from '@/lib/summary-window';
import type { Dict } from '@/lib/i18n';

/**
 * Вкладки сводки. Ключи и границы живут в `lib/summary-window.ts` — они
 * общие с приложением, и разъехаться им нельзя: это те же деньги за тот же
 * день, показанные с двух сторон. Здесь только подписи и адреса.
 *
 * Была константой модуля — стала функцией: подписи приходят из словаря, а
 * посчитанный один раз при загрузке список навсегда остался бы на языке
 * того, кто первым открыл кабинет после запуска сервера.
 */
export function periods(t: Dict): { key: PeriodKey; label: string }[] {
  const labels: Record<PeriodKey, string> = {
    today: t.owner.periodToday,
    month: t.owner.periodMonth,
    prevmonth: t.owner.periodPrevMonth,
  };
  return PERIOD_KEYS.map((key) => ({ key, label: labels[key] }));
}

export type { PeriodKey };

/** Чужое или пустое `?p=` молча читается как «сегодня». */
export function getPeriod(p: string | undefined): PeriodKey {
  return (PERIOD_KEYS as readonly string[]).includes(p ?? '') ? (p as PeriodKey) : 'today';
}

export function periodHref(key: PeriodKey): string {
  return key === 'today' ? '/owner' : `/owner?p=${key}`;
}
