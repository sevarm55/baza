/**
 * Форма данных отчёта: только то, что рисуют графики и таблицы.
 *
 * Через границу сервер-клиент уходят подписи и числа, а не даты и не
 * строки базы: подписи собраны на сервере в поясе бизнеса и на языке
 * смотрящего, деньги форматирует клиент одним `formatMoney`.
 */

export const TABS = ['overview', 'finance', 'operations', 'team'] as const;
export type ReportTab = (typeof TABS)[number];

export const SCOPES = ['current', 'all', 'compare'] as const;
export type Scope = (typeof SCOPES)[number];

/** Точка ряда: час или день. Поля `prev*` из сопоставимого отрезка. */
export type Point = {
  key: string;
  label: string;
  revenue: number;
  count: number;
  paidCount: number;
  payroll: number;
  costs: number;
  net: number;
  avgCheck: number;
  prevRevenue: number | null;
  prevCount: number | null;
  prevAvgCheck: number | null;
};

export type HeatRow = { dow: number; hour: number; count: number; revenue: number };

export type ServiceRow = {
  key: string;
  name: string;
  count: number;
  revenue: number;
  avg: number;
  /** доля выручки, проценты с одним знаком */
  share: number;
};

export type CostRow = {
  key: string;
  name: string;
  monthly: boolean;
  amount: number;
  share: number;
  /** сумма за предыдущий отрезок; null, если тогда не было */
  prev: number | null;
};

export type PaymentRow = {
  key: string;
  label: string;
  revenue: number;
  count: number;
  share: number;
  color: string;
};

export type TeamRow = {
  key: string;
  name: string;
  count: number;
  revenue: number;
  earned: number;
  avgCheck: number;
  shifts: number;
  hours: number;
  percent: number;
  /** доля начисленного среди всех */
  share: number;
};

export type BranchRow = {
  id: string;
  name: string;
  current: boolean;
  revenue: number;
  profit: number;
  count: number;
  avgCheck: number;
  payroll: number;
  costs: number;
};

/** Ряд по филиалам для наложения на график: ключ точки → выручка. */
export type BranchSeries = { id: string; name: string; color: string; points: { key: string; revenue: number }[] };
