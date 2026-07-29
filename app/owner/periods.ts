import { hy } from '@/lib/i18n/hy';

/**
 * Периоды сводки. Ключ — он же значение `?p=` в адресе, поэтому лежит
 * отдельно от вкладок: страница по нему считает выборку, вкладки его рисуют,
 * и обеим сторонам нужен один и тот же список.
 */
export const PERIODS = [
  { key: 'today', label: hy.owner.periodToday },
  { key: '7', label: hy.owner.periodWeek },
  { key: '30', label: hy.owner.periodMonth },
] as const;

export type PeriodKey = (typeof PERIODS)[number]['key'];

/** Чужое или пустое `?p=` молча читается как «сегодня». */
export function getPeriod(p: string | undefined) {
  return PERIODS.find((x) => x.key === p) ?? PERIODS[0];
}

export function periodHref(key: PeriodKey): string {
  return key === 'today' ? '/owner' : `/owner?p=${key}`;
}
