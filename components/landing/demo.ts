import type { ActivityRow } from '@/lib/activity-types';
import type { Point, HeatRow, BranchRow } from '@/app/owner/reports/model';

/**
 * Демо-данные витрины: один рабочий день одной мойки.
 *
 * Числа выдуманы, но сходятся между собой: выручка это сумма машин,
 * зарплата это проценты от них, чистый результат это разница. Никакой
 * случайности: витрина обязана показывать одно и то же всем.
 */
export const DEMO = {
  business: 'Ալիք',
  branches: ['Ալիք · Կենտրոն', 'Ալիք · Աջափնյակ'],
  staff: [
    { name: 'Արման', percent: 40, cars: 11, earned: 22_400 },
    { name: 'Գոռ', percent: 35, cars: 9, earned: 15_750 },
    { name: 'Հայկ', percent: 35, cars: 6, earned: 10_850 },
  ],
  services: ['Կոմպլեքս', 'Թափք', 'Սրահ'],
  cars: 26,
  revenue: 142_000,
  payroll: 49_000,
  costs: 18_500,
  get profit() {
    return this.revenue - this.payroll - this.costs;
  },
  avgCheck: 5_462,
  prevProfit: 61_300,
  plates: ['35 AA 777', '77 GG 477', '19 QW 412', '48 GH 505', '01 LL 318'],
  expenses: [
    { category: 'Քիմիա', amount: 8_500, monthly: false },
    { category: 'Ջուր', amount: 6_000, monthly: true },
    { category: 'Վարձ', amount: 4_000, monthly: true },
  ],
  payments: [
    { key: 'cash', value: 78_000, color: 'var(--success)' },
    { key: 'card', value: 52_000, color: 'var(--chart-1)' },
    { key: 'transfer', value: 12_000, color: 'var(--chart-3)' },
  ],
};

const NOW = '2026-08-23T';

/** Лента сегодняшнего дня: новые сверху. */
export const DEMO_ACTIVITY: ActivityRow[] = [
  row('a1', 'car.created', 'Արման', 'staff', '12:41', { key: '35 AA 777', service: 'Կոմպլեքս', amount: 6_000, payment: 'card' }),
  row('a2', 'expense.created', 'Դավիթ', 'owner', '12:20', { category: 'Քիմիա', amount: 8_500 }),
  row('a3', 'car.created', 'Գոռ', 'staff', '12:05', { key: '77 GG 477', service: 'Թափք', amount: 3_500, payment: 'cash' }),
  row('a4', 'car.created', 'Հայկ', 'staff', '11:48', { key: '19 QW 412', service: 'Սրահ', amount: 4_000, payment: 'cash', crew: ['Հայկ', 'Գոռ'] }),
  row('a5', 'shift.started', 'Հայկ', 'staff', '11:30', {}),
  row('a6', 'car.created', 'Արման', 'staff', '11:12', { key: '48 GH 505', service: 'Կոմպլեքս', amount: 6_000, payment: 'transfer' }),
  row('a7', 'shift.started', 'Գոռ', 'staff', '09:02', {}),
  row('a8', 'shift.started', 'Արման', 'staff', '08:58', {}),
];

function row(
  id: string,
  type: ActivityRow['type'],
  name: string,
  role: ActivityRow['actorRole'],
  time: string,
  data: ActivityRow['data'],
): ActivityRow {
  return {
    id,
    type,
    entity: 'car',
    entityId: null,
    actorId: id,
    actorName: name,
    actorRole: role,
    data,
    at: `${NOW}${time}:00+04:00`,
  };
}

/** Месяц по дням: выручка, зарплата, расходы, чистыми. */
export const DEMO_POINTS: Point[] = [
  [120, 24], [135, 26], [98, 19], [142, 27], [151, 29], [168, 33], [155, 30],
  [110, 22], [128, 25], [144, 28], [139, 27], [160, 31], [172, 34], [158, 30],
  [124, 24], [137, 26], [149, 29], [146, 28], [163, 32], [178, 35], [166, 32],
  [131, 25], [140, 27], [142, 26],
].map(([rev, cars], i) => {
  const revenue = rev * 1000;
  const payroll = Math.round(revenue * 0.35);
  const costs = i % 7 === 2 ? 14_000 : 6_000;
  const prev = Math.round(revenue * 0.88);
  return {
    key: `2026-08-${String(i + 1).padStart(2, '0')} 00`,
    label: String(i + 1).padStart(2, '0'),
    revenue,
    count: cars,
    paidCount: cars,
    payroll,
    costs,
    net: revenue - payroll - costs,
    avgCheck: Math.round(revenue / cars),
    prevRevenue: prev,
    prevCount: Math.round(cars * 0.9),
    prevAvgCheck: Math.round(prev / Math.max(1, Math.round(cars * 0.9))),
  };
});

/** Тепловая карта: будни ровные, пятница и суббота плотнее, утро и вечер пики. */
export const DEMO_HEAT: HeatRow[] = (() => {
  const rows: HeatRow[] = [];
  const base = [6, 7, 7, 8, 11, 13, 5];
  const shape = [0.4, 0.9, 1, 0.8, 0.6, 0.5, 0.6, 0.9, 1.1, 1.2, 0.9, 0.5, 0.2];
  for (let dow = 1; dow <= 7; dow++) {
    shape.forEach((k, i) => {
      const count = Math.round(base[dow - 1] * k);
      if (count > 0) rows.push({ dow, hour: 8 + i, count, revenue: count * 5_300 });
    });
  }
  return rows;
})();

export const DEMO_BRANCHES: BranchRow[] = [
  { id: 'b1', name: DEMO.branches[0], current: true, revenue: 3_140_000, profit: 1_420_000, count: 581, avgCheck: 5_405, payroll: 1_100_000, costs: 620_000 },
  { id: 'b2', name: DEMO.branches[1], current: false, revenue: 2_260_000, profit: 930_000, count: 433, avgCheck: 5_219, payroll: 790_000, costs: 540_000 },
];
