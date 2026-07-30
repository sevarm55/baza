import { and, desc, eq, gte, isNull, or, sql } from 'drizzle-orm';
import { db } from './db';
import { expenses } from './db/schema';

/**
 * Расходы и прибыль.
 *
 * Выручка отвечала на вопрос «сколько намыли». Владелец спрашивает другое:
 * «сколько осталось». Разница между ними — зарплата и расходы; зарплата
 * уже считалась из снимков процента в записях, здесь появляется вторая
 * половина.
 */

/**
 * Средняя длина месяца: 365.25 / 12.
 *
 * Постоянный расход относится ко всем дням месяца сразу, и в день его
 * доля — сумма, делённая на длину месяца. Берём среднюю, а не настоящую:
 * иначе февральская прибыль оказывалась бы выше январской на ровном
 * месте, просто потому что дней меньше. Владелец такую разницу заметит
 * и не поверит цифре.
 */
const DAYS_IN_MONTH = 30.4375;

export type NewExpense = {
  tenantId: string;
  userId: string | null;
  amount: number;
  category: string;
  note?: string | null;
  monthly?: boolean;
  at?: Date;
};

export class BadExpenseError extends Error {
  constructor(code: 'EMPTY_CATEGORY' | 'BAD_AMOUNT') {
    super(code);
  }
}

export async function addExpense(input: NewExpense) {
  const category = input.category.trim();
  if (!category) throw new BadExpenseError('EMPTY_CATEGORY');
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    throw new BadExpenseError('BAD_AMOUNT');
  }

  const [row] = await db
    .insert(expenses)
    .values({
      tenantId: input.tenantId,
      createdBy: input.userId,
      amount: input.amount,
      category,
      note: input.note?.trim() || null,
      monthly: input.monthly ?? false,
      at: input.at ?? new Date(),
    })
    .returning();

  return row;
}

/**
 * Что показывать в списке: все действующие постоянные и разовые за период.
 *
 * Постоянные не фильтруются по дате: аренда, заведённая полгода назад,
 * действует и сегодня, и не увидеть её в списке было бы странно.
 */
export async function listExpenses(tenantId: string, from: Date) {
  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        or(
          and(eq(expenses.monthly, true), isNull(expenses.endedAt)),
          and(eq(expenses.monthly, false), gte(expenses.at, from)),
        ),
      ),
    )
    .orderBy(desc(expenses.monthly), desc(expenses.at));
}

/**
 * Убрать расход.
 *
 * Разовый удаляется совсем — это точка во времени, и удаление здесь
 * означает «ошибся, не было такого». Постоянный закрывается датой:
 * снести аренду значило бы переписать прибыль за все месяцы, когда её
 * платили, а на те цифры владелец уже смотрел.
 */
export async function removeExpense(tenantId: string, id: string): Promise<boolean> {
  /* Кривой id до Postgres доводить нельзя: он бросит своё на разборе
     uuid, и наружу вместо «не найдено» уйдёт пятисотка. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;

  const [row] = await db
    .select({ monthly: expenses.monthly })
    .from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));

  if (!row) return false;

  if (row.monthly) {
    await db
      .update(expenses)
      .set({ endedAt: new Date() })
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));
  } else {
    await db.delete(expenses).where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));
  }
  return true;
}

export type PeriodCosts = {
  /** разовые траты, попавшие в период */
  oneOff: number;
  /** доля постоянных, приходящаяся на дни периода */
  monthlyShare: number;
  total: number;
};

/**
 * Сколько расходов приходится на период.
 *
 * Постоянные считаются долей: сумма × (дней пересечения / длина месяца).
 * Пересечение берётся с учётом того, когда расход начал и перестал
 * действовать, — аренда, заведённая вчера, не должна задним числом
 * съесть прибыль за прошлый месяц.
 */
export async function getPeriodCosts(
  tenantId: string,
  from: Date,
  to: Date = new Date(),
): Promise<PeriodCosts> {
  const [row] = await db
    .select({
      oneOff: sql<number>`coalesce(sum(${expenses.amount}) filter (
        where ${expenses.monthly} = false
          and ${expenses.at} >= ${from}
          and ${expenses.at} < ${to}
      ), 0)::int`,

      monthlyShare: sql<number>`coalesce(round(sum(
        case when ${expenses.monthly} then
          ${expenses.amount} * greatest(0, extract(epoch from (
            least(coalesce(${expenses.endedAt}, ${to}::timestamptz), ${to}::timestamptz)
            - greatest(${expenses.at}, ${from}::timestamptz)
          )) / 86400.0) / ${DAYS_IN_MONTH}
        else 0 end
      )), 0)::int`,
    })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId));

  const oneOff = row?.oneOff ?? 0;
  const monthlyShare = row?.monthlyShare ?? 0;
  return { oneOff, monthlyShare, total: oneOff + monthlyShare };
}

/**
 * Прибыль.
 *
 * Зарплата берётся начисленная, а не выплаченная: работа сделана, деньги
 * человеку причитаются, и считать их «ещё своими» пока не рассчитались —
 * тот же самообман, что не считать аренду.
 */
export function profitOf(revenue: number, payroll: number, costs: PeriodCosts): number {
  return revenue - payroll - costs.total;
}

/** Подсказки в форме: то, на что мойка тратит чаще всего. */
export const EXPENSE_HINTS = [
  'Քիմիա',
  'Վարձ',
  'Հոսանք',
  'Ջուր',
  'Գույք',
  'Վերանորոգում',
] as const;
