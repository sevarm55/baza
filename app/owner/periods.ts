import { hy } from '@/lib/i18n/hy';
import { PERIOD_KEYS, type PeriodKey } from '@/lib/summary-window';

/**
 * Вкладки сводки. Ключи и границы живут в `lib/summary-window.ts` — они
 * общие с приложением, и разъехаться им нельзя: это те же деньги за тот же
 * день, показанные с двух сторон.
 *
 * Здесь только подписи и адреса.
 */
const LABELS: Record<PeriodKey, string> = {
  today: hy.owner.periodToday,
  month: hy.owner.periodMonth,
  prevmonth: hy.owner.periodPrevMonth,
};

export const PERIODS = PERIOD_KEYS.map((key) => ({ key, label: LABELS[key] }));

export type { PeriodKey };

/** Чужое или пустое `?p=` молча читается как «сегодня». */
export function getPeriod(p: string | undefined) {
  return PERIODS.find((x) => x.key === p) ?? PERIODS[0];
}

export function periodHref(key: PeriodKey): string {
  return key === 'today' ? '/owner' : `/owner?p=${key}`;
}
