import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
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
export async function listExpenses(
  tenantId: string,
  from: Date,
  to?: Date,
  { activeMonthlyOnly = false }: { activeMonthlyOnly?: boolean } = {},
) {
  /* Верхняя граница нужна закрытому месяцу.

     Без неё окно было скользящим — «последние тридцать дней», — и
     десятого августа в списке лежала июльская химия. Итог наверху
     складывал её с августовскими, и владелец видел в графе «этот месяц»
     деньги, потраченные в прошлом.

     Постоянный расход попадает в месяц, если он в нём ДЕЙСТВОВАЛ:
     заведён до конца месяца и не закрыт до его начала. Проверять только
     `endedAt is null` нельзя — закрытая в июле аренда обязана остаться в
     июльском счёте, иначе прошлый месяц задним числом дешевеет. */
  const monthlyEnd = activeMonthlyOnly
    ? isNull(expenses.endedAt)
    : or(isNull(expenses.endedAt), gte(expenses.endedAt, from));

  return db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        or(
          and(
            eq(expenses.monthly, true),
            to ? lt(expenses.at, to) : undefined,
            monthlyEnd,
          ),
          and(
            eq(expenses.monthly, false),
            gte(expenses.at, from),
            to ? lt(expenses.at, to) : undefined,
          ),
        ),
      ),
    )
    .orderBy(desc(expenses.monthly), desc(expenses.at));
}

/**
 * Сколько ЭТА строка стоила бизнесу за период.
 *
 * Постоянный расход платят раз в месяц, а живёт он каждый день: аренда
 * в 300 000 стоит бизнесу примерно 9 677 в сутки, и десятого числа
 * набежала треть. Разовый лежит в своём дне целиком.
 *
 * Выражение одно на весь продукт: им считается и итог периода
 * (`getPeriodCosts`), и разбивка по названиям (`getCostsByCategory`), и
 * строки списка расходов. Три копии одной формулы разъезжаются молча, а
 * расхождение на экране, где считают деньги, читается как ошибка
 * расчёта.
 *
 * Округление — на каждой строке, а не на сумме. `round(sum(...))` даёт
 * итог, который на драм-другой не сходится с суммой показанных строк, и
 * это худший из возможных видов ошибки: каждое число по отдельности
 * верно, а вместе они не сходятся, и проверить их нечем.
 *
 * Границы приходят строками с явным приведением, а не объектами Date.
 * Драйвер боевого Postgres (postgres-js) не умеет угадывать тип
 * параметра в сыром SQL и на объекте Date падает с ERR_INVALID_ARG_TYPE;
 * PGlite, на котором идут тесты, это прощает — поэтому ошибка вылезла
 * только на сервере. Строка плюс ::timestamptz однозначны для обоих.
 */
export function shareOfPeriod(fromAt: string, toAt: string, spread: number) {
  return sql`round(
    case when ${expenses.monthly} then
      ${expenses.amount} * greatest(0, extract(epoch from (
        least(coalesce(${expenses.endedAt}, ${toAt}::timestamptz), ${toAt}::timestamptz)
        - greatest(${expenses.at}, ${fromAt}::timestamptz)
      )) / 86400.0) / ${spread}::numeric
    else
      case
        when ${expenses.at} >= ${fromAt}::timestamptz
         and ${expenses.at} < ${toAt}::timestamptz
        then ${expenses.amount}
        else 0
      end
    end
  )`;
}

/**
 * Строки расходов вместе с тем, во что каждая обошлась за период.
 *
 * Без доли список врёт дважды. «Վարձ 300 000 ֏» десятого августа
 * читается как «я потратил триста тысяч» — а потратил девяносто семь; и
 * наоборот, если показать одну долю, строка перестанет отвечать на
 * вопрос «а сколько вообще стоит аренда». Поэтому в строке оба числа:
 * номинал — то, о чём договорились, доля — то, что уже стоило.
 */
export type PeriodExpense = {
  id: string;
  category: string;
  note: string | null;
  monthly: boolean;
  amount: number;
  /** сколько из этой строки пришлось на период */
  share: number;
  at: Date;
  endedAt: Date | null;
};

export async function listPeriodExpenses(
  tenantId: string,
  from: Date,
  to: Date,
  spread: CostSpread,
  { activeMonthlyOnly = false }: { activeMonthlyOnly?: boolean } = {},
): Promise<PeriodExpense[]> {
  const rows = await listExpenses(tenantId, from, to, { activeMonthlyOnly });
  if (rows.length === 0) return [];

  /* Доля считается там же, где итог, — в базе. Посчитать её второй раз
     на JS значило бы завести второй источник правды для денег: формула
     одна, но округление, часовые пояса и границы месяца у двух реализаций
     совпадают ровно до первого исправления в одной из них. */
  const shares = await db
    .select({
      id: expenses.id,
      share: sql<number>`coalesce(${shareOfPeriod(from.toISOString(), to.toISOString(), spread)}, 0)::int`,
    })
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId));

  const shareBy = new Map(shares.map((s) => [s.id, s.share]));

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    note: r.note,
    monthly: r.monthly,
    amount: r.amount,
    share: shareBy.get(r.id) ?? 0,
    at: r.at,
    endedAt: r.endedAt,
  }));
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
  /**
   * Новый день разового расхода.
   *
   * Только для разового и только потому, что заводят их пачкой — за всю
   * неделю сразу, — и ошибиться днём при этом легко. У постоянного
   * такого поля нет и быть не может: у него `at` это день, с которого он
   * начал действовать, и сдвинуть его значит переписать прибыль за уже
   * прожитые дни.
   */
  at?: Date;
  dayStart: Date;
}) {
  const category = params.category.trim();
  if (!category) throw new BadExpenseError('EMPTY_CATEGORY');
  if (!Number.isInteger(params.amount) || params.amount <= 0) {
    throw new BadExpenseError('BAD_AMOUNT');
  }

  /* Закрытие старой суммы и создание новой — одно действие. Без
     транзакции обрыв между двумя запросами оставлял бессрочный расход
     закрытым, но без замены: именно так аренда могла внезапно перестать
     учитываться после неудачной правки. */
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)));

    if (!row || row.endedAt) return null;

    const note = params.note?.trim() || null;
    const sameAmount = row.amount === params.amount;

    if (!row.monthly || sameAmount) {
      const [updated] = await tx
        .update(expenses)
        .set({
          amount: params.amount,
          category,
          note,
          ...(!row.monthly && params.at ? { at: params.at } : {}),
        })
        .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)))
        .returning();
      return updated;
    }

    /* Заведён сегодня и сегодня же исправлен — это опечатка, а не подорожание.
       Старая строка закрывается тем же мгновением, с которого началась, и
       не стоит бизнесу ни дня. */
    const endedAt = row.at > params.dayStart ? row.at : params.dayStart;

    await tx
      .update(expenses)
      .set({ endedAt })
      .where(and(eq(expenses.tenantId, params.tenantId), eq(expenses.id, params.id)));

    const [fresh] = await tx
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
  });
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
  const share = shareOfPeriod(from.toISOString(), to.toISOString(), spread);

  const [row] = await db
    .select({
      oneOff: sql<number>`coalesce(sum(${share}) filter (where ${expenses.monthly} = false), 0)::int`,
      monthlyShare: sql<number>`coalesce(sum(${share}) filter (where ${expenses.monthly}), 0)::int`,
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
