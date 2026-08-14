import { db } from './db';
import { audit, payouts } from './db/schema';
import { getUnsettledByDay, startOfDay } from './queries';

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
  timezone: string;
  /**
   * За какой день платим, `YYYY-MM-DD`. Без него — за все незакрытые дни
   * сразу, по строке на каждый.
   *
   * Строка на день, а не один отрезок на нажатие: иначе история
   * превращается в ленту нажатий, а не дней, и вопрос «за какой день я
   * заплатил» снова остаётся без ответа. Две выдачи в один день дают две
   * строки с одной датой — это честно: так и было в жизни, — а на экране
   * они складываются в один день.
   */
  day?: string;
}): Promise<{ paid: number; days: number }> {
  const owing = (await getUnsettledByDay(params.tenantId, params.timezone)).filter(
    (d) => d.staffId === params.staffId && d.earned > 0 && (!params.day || d.day === params.day),
  );

  if (owing.length === 0) return { paid: 0, days: 0 };

  const total = owing.reduce((sum, d) => sum + d.earned, 0);

  await db.transaction(async (tx) => {
    await tx.insert(payouts).values(
      owing.map((d) => ({
        tenantId: params.tenantId,
        staffId: params.staffId,
        /* Границы отрезка остаются заполненными: на них смотрит старый
           код и старые строки истории. Для дневной выплаты это сам день —
           от его полуночи до полуночи следующего. */
        periodFrom: dayStart(params.timezone, d.day),
        periodTo: dayStart(params.timezone, d.day, 1),
        day: d.day,
        amount: d.earned,
        paidBy: params.byUserId,
      })),
    );

    await tx.insert(audit).values({
      tenantId: params.tenantId,
      userId: params.byUserId,
      action: 'payout',
      entity: 'user',
      entityId: params.staffId,
      data: { amount: total, days: owing.map((d) => d.day) },
    });
  });

  return { paid: total, days: owing.length };
}

/**
 * Полночь дня в поясе мойки, со сдвигом на `plus` суток.
 *
 * Полдень по UTC плюс сутки попадает внутрь следующего дня при любом
 * смещении пояса, а `startOfDay` дальше приводит момент к местной
 * полуночи. Складывать по 24 часа к самой полуночи нельзя: переход на
 * летнее время сдвинул бы границу на час.
 */
function dayStart(timezone: string, day: string, plus = 0): Date {
  const noon = Date.parse(`${day}T12:00:00Z`);
  return startOfDay(timezone, new Date(noon + plus * 86_400_000));
}
