import { db } from './db';
import { audit, payouts } from './db/schema';
import { getSettledUntil, getUnsettledPayroll } from './queries';

/**
 * Отметить расчёт с сотрудником.
 *
 * Живёт отдельно от Server Action намеренно: то же самое делает API для
 * приложения, а расчёт с человеком — не то место, где можно позволить
 * себе две копии логики. Разойдутся они не сразу и молча.
 *
 * Два решения внутри, оба про деньги:
 *
 * 1. Сумма считается здесь и НЕ приходит снаружи. Иначе подделанный
 *    запрос запишет в историю выплат что угодно.
 *
 * 2. Верхняя граница `until` фиксируется ДО подсчёта. Запись, созданная
 *    в этот же момент, попадёт в следующий расчёт, а не потеряется между
 *    посчитанной суммой и отметкой о выплате.
 */
export async function settleStaff(params: {
  tenantId: string;
  staffId: string;
  byUserId: string;
}): Promise<{ paid: number; orders: number }> {
  const until = new Date();
  const [rows, settled] = await Promise.all([
    getUnsettledPayroll(params.tenantId, until),
    getSettledUntil(params.tenantId),
  ]);

  const row = rows.find((r) => r.staffId === params.staffId);
  if (!row || row.earned <= 0) return { paid: 0, orders: 0 };

  await db.transaction(async (tx) => {
    await tx.insert(payouts).values({
      tenantId: params.tenantId,
      staffId: params.staffId,
      periodFrom: settled.get(params.staffId) ?? new Date(0),
      periodTo: until,
      amount: row.earned,
      paidBy: params.byUserId,
    });

    await tx.insert(audit).values({
      tenantId: params.tenantId,
      userId: params.byUserId,
      action: 'payout',
      entity: 'user',
      entityId: params.staffId,
      data: { amount: row.earned, orders: row.count },
    });
  });

  return { paid: row.earned, orders: row.count };
}
