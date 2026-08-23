import { db } from './db';
import { recordActivity } from './activity';
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
  /**
   * Момент выдачи. Обычно его ставит база, но у расчёта сразу с
   * несколькими людьми он общий и приходит снаружи.
   *
   * Иначе история не может показать одну выдачу одной выдачей: `now()`
   * в постгресе — это время НАЧАЛА транзакции, и три расчёта, сделанные
   * одним нажатием, ложатся тремя разными моментами с разницей в
   * микросекунды. Владелец отдал деньги один раз, и в истории это
   * обязано выглядеть одним событием, а не тремя похожими.
   */
  paidAt?: Date;
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
        ...(params.paidAt ? { paidAt: params.paidAt } : {}),
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

    await recordActivity(tx, {
      tenantId: params.tenantId,
      type: 'payout.made',
      actorId: params.byUserId,
      entityId: params.staffId,
      data: { name: owing[0]?.name ?? undefined, amount: total, count: owing.length },
      ...(params.paidAt ? { at: params.paidAt } : {}),
    });
  });

  return { paid: total, days: owing.length };
}

/**
 * Расчёт сразу с несколькими — одним действием.
 *
 * В жизни владелец закрывает день целиком: пересчитал вчерашнее, раздал
 * троим, забыл. По кнопке на человека это три отдельных события, между
 * которыми можно отвлечься и половину не отдать.
 *
 * Момент выдачи общий на весь список, и это не мелочь оформления: `now()`
 * в постгресе — время НАЧАЛА транзакции, и три расчёта, сделанные одним
 * нажатием, легли бы тремя моментами с разницей в микросекунды. Владелец
 * отдал деньги один раз, и в истории это обязано выглядеть одним
 * событием, а не тремя похожими строками.
 *
 * Общей транзакции на весь список нет намеренно: у каждого человека свой
 * пересчёт незакрытых дней, и складывать их в одну транзакцию значит
 * держать её открытой на всё время расчёта. Поэтому возвращаем то, что
 * действительно легло, — обе стороны показывают это число, а не то,
 * которое просили.
 */
export async function settleMany(params: {
  tenantId: string;
  byUserId: string;
  timezone: string;
  items: { staffId: string; day: string }[];
}): Promise<{ ok: boolean; paid: number; people: number }> {
  if (params.items.length === 0) return { ok: true, paid: 0, people: 0 };

  const paidAt = new Date();
  const people = new Set<string>();
  let paid = 0;

  for (const item of params.items) {
    try {
      const result = await settleStaff({
        tenantId: params.tenantId,
        staffId: item.staffId,
        byUserId: params.byUserId,
        timezone: params.timezone,
        day: item.day,
        paidAt,
      });
      if (result.paid !== 0) {
        paid += result.paid;
        people.add(item.staffId);
      }
    } catch {
      /* Часть расчётов могла лечь до сбоя. Врать про это нельзя: обе
         стороны перечитают лист с сервера и покажут, что осталось. */
      return { ok: false, paid, people: people.size };
    }
  }

  return { ok: true, paid, people: people.size };
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
