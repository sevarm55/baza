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
 * Изменить расход.
 *
 * Аренда дорожает, и это самое обычное событие в жизни мойки. Но
 * переписать сумму на месте нельзя: доля постоянного расхода считается
 * из его суммы за все дни, что он действует, — и новая цифра задним
 * числом переписала бы прибыль за все прошлые месяцы. Владелец смотрел
 * на те цифры, сверял с кассой, принимал по ним решения.
 *
 * Поэтому изменение суммы — это конец старого расхода и начало нового с
 * того же дня. Ровно так же, как цена услуги не переписывает уже сделанные
 * записи: прошлое зафиксировано, меняется только будущее.
 *
 * Название и заметку правим на месте — исправленная опечатка в слове
 * «Վարձ» не меняет ни одной цифры.
 *
 * Разовый расход правится целиком: это не «стало столько», а «я ошибся
 * при вводе», и прошлое здесь надо именно поправить.
 *
 * Границей берём начало дня, а не текущую минуту: постоянные расходы
 * начисляются целыми днями, и день, разрезанный пополам старой и новой
 * арендой, дал бы цифру, которую не проверить в уме.
 */
export async function editExpense(params: {
  tenantId: string;
  id: string;
  userId: string | null;
  amount: number;
  category: string;
  note?: string | null;
  dayStart: Date;
}) {
  const category = params.category.trim();
  if (!category) throw new BadExpenseError('EMPTY_CATEGORY');
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new BadExpenseError('BAD_AMOUNT');
  }

  const [row] = await db
    .select()
    .from(expenses)
    .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)));

  if (!row || row.endedAt) return null;

  const note = params.note?.trim() || null;
  const sameAmount = row.amount === params.amount;

  if (!row.monthly || sameAmount) {
    const [updated] = await db
      .update(expenses)
      .set({ amount: params.amount, category, note })
      .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)))
      .returning();
    return updated;
  }

  /* Заведён сегодня и сегодня же исправлен — это опечатка, а не подорожание.
     Старая строка закрывается тем же мгновением, с которого началась, и
     не стоит бизнесу ни дня. */
  const endedAt = row.at > params.dayStart ? row.at : params.dayStart;

  await db
    .update(expenses)
    .set({ endedAt })
    .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)));

  const [fresh] = await db
    .insert(expenses)
    .values({
      tenantId: params.tenantId,
      createdBy: params.userId,
      amount: params.amount,
      category,
      note,
      monthly: true,
      at: endedAt,
    })
    .returning();

  return fresh;
}

/**
 * Убрать расход.
 *
 * Разовый удаляется совсем — это точка во времени, и удаление здесь
 * означает «ошибся, не было такого». Постоянный закрывается датой:
 * снести аренду значило бы переписать прибыль за все месяцы, когда её
 * платили, а на те цифры владелец уже смотрел.
 *
 * Закрываем началом дня, а не текущей минутой. Тогда аренда, заведённая
 * по ошибке и убранная в тот же день, не стоит бизнесу ничего — а именно
 * так удаление и понимают, когда жмут кнопку через минуту после ввода.
 */
export async function removeExpense(
  tenantId: string,
  id: string,
  dayStart: Date,
): Promise<boolean> {
  /* Кривой id до Postgres доводить нельзя: он бросит своё на разборе
     uuid, и наружу вместо «не найдено» уйдёт пятисотка. */
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return false;

  const [row] = await db
    .select({ monthly: expenses.monthly, at: expenses.at })
    .from(expenses)
    .where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));

  if (!row) return false;

  if (row.monthly) {
    await db
      .update(expenses)
      .set({ endedAt: row.at > dayStart ? row.at : dayStart })
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));
  } else {
    await db.delete(expenses).where(and(eq(expenses.tenantId, tenantId), eq(expenses.id, id)));
  }
  return true;
}

/**
 * На сколько дней делится месячный расход.
 *
 * Знаменатель — длина ТОГО календарного месяца, в который попал период, а
 * не усреднённые 30,44 и не длина окна. Три случая, и все три обязаны
 * сходиться:
 *
 *   целый месяц      31 / 31 = 1     вся аренда, ни драмом больше
 *   месяц по 7-е      7 / 31          седьмая часть, а не полная сумма
 *   одни сутки        1 / 31          дневная доля
 *
 * Через 30,4375 первый случай давал 101,8 % — расход, которого не было.
 * Через длину окна второй давал всю аренду на первой неделе: прибыль в
 * начале месяца проваливалась и потом росла сама по себе, без единой
 * машины. Длина месяца снимает оба.
 *
 * Сама функция, которая её считает, живёт в `lib/time.ts`: она чистая, а
 * этот модуль тянет за собой драйвер базы, и значение отсюда утащило бы
 * его в браузерный бандл.
 */
export type CostSpread = number;

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
  /** длина календарного месяца периода — знаменатель для постоянных */
  spread: CostSpread = 30.4375,
): Promise<PeriodCosts> {
  /* Даты уходят строками с явным приведением, а не объектами Date.
     Драйвер боевого Postgres (postgres-js) не умеет угадывать тип
     параметра в сыром SQL и на объекте Date падает с ERR_INVALID_ARG_TYPE;
     PGlite, на котором идут тесты, это прощает — поэтому ошибка вылезла
     только на сервере. Строка плюс ::timestamptz однозначны для обоих. */
  const fromAt = from.toISOString();
  const toAt = to.toISOString();

  const [row] = await db
    .select({
      oneOff: sql<number>`coalesce(sum(${expenses.amount}) filter (
        where ${expenses.monthly} = false
          and ${expenses.at} >= ${fromAt}::timestamptz
          and ${expenses.at} < ${toAt}::timestamptz
      ), 0)::int`,

      monthlyShare: sql<number>`coalesce(round(sum(
        case when ${expenses.monthly} then
          ${expenses.amount} * greatest(0, extract(epoch from (
            least(coalesce(${expenses.endedAt}, ${toAt}::timestamptz), ${toAt}::timestamptz)
            - greatest(${expenses.at}, ${fromAt}::timestamptz)
          )) / 86400.0) / ${spread}::numeric
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
