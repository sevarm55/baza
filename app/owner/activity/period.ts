/** Отрезки ленты: выбор живёт в адресе (`?d=`). Без `'use client'`: этим
 * пользуются и страница на сервере, и фильтры в браузере. */
export const PERIODS = ['today', 'yesterday', 'week', 'month'] as const;
export type ActivityPeriod = (typeof PERIODS)[number];
