import {
  getPaidByDay,
  getUnsettledByDay,
  getUnsettledOrderLines,
  getUnsettledUnitsByDay,
  listPayouts,
} from './queries';
import { DEFAULT_LOCALE } from './i18n';
import { serviceNameTerm } from './i18n/terms';

/**
 * Лист зарплат, собранный из трёх разных вещей в один ответ.
 *
 * В базе они лежат порознь: заработанное по дням, отданное по дням и
 * записи о выдачах. Ни одна из трёх сама по себе на вопрос владельца не
 * отвечает — «кому я должен и за какой день» получается только из всех
 * трёх сразу, и склейка эта нетривиальная: закрытый день выходит из
 * `getUnsettledByDay` с нулём и ничем не отличается от дня, в котором
 * человек мыл по нулевой ставке.
 *
 * Поэтому склейка живёт здесь, в одном месте, а не в странице и не в
 * приложении по копии. Два экрана одного продукта, считающие деньги
 * порознь, расходятся не сразу и молча, а расхождение на листе зарплат
 * читается как ошибка расчёта, а не как «ещё не перенесли».
 *
 * Слов здесь нет: ни подписей, ни дат словами. Числа и ключи дней — то,
 * что обязано совпадать; как это назвать, каждая сторона решает сама, на
 * своём языке и своими форматами.
 */

/** Машина, из которой сложилась дневная доля человека. */
export type BoardLine = {
  id: string;
  /** «34 AA 555 · Комплекс» — чем запись названа в ленте */
  title: string;
  price: number;
  /** ставка, применённая ко всей машине: у совместной — процент команды */
  percent: number;
  /** начислено этому человеку за эту машину */
  earned: number;
  /**
   * Сколько человек мыли машину. Один — обычная одиночная мойка.
   *
   * Без этого числа строка совместной мойки читается как ошибка: под
   * машиной за 12 000 стоит «45 %» и «1 800 ֏», и первое со вторым не
   * сходится, пока не сказано, что фонд делили на троих.
   */
  crew: number;
};

/** Человек внутри рабочего дня. */
export type BoardPerson = {
  /** пусто у записей без исполнителя: платить по ним некому */
  staffId: string | null;
  name: string | null;
  count: number;
  /** сколько за этот день ещё должны */
  earned: number;
  /** сколько за этот день уже отдано */
  paid: number;
  /** когда отдали в последний раз; пусто — не отдавали */
  paidAt: Date | null;
  /* Ставки, по которым посчитан ЭТОТ день: процент лежит снимком в
     каждой записи, и текущая ставка человека сумму дня не объясняет. */
  pctFrom: number | null;
  pctTo: number | null;
  /** разложение по машинам; пусто, если полного разложения нет */
  lines: BoardLine[] | null;
};

/** Рабочий день целиком: и долг, и уже закрытое. */
export type BoardDay = {
  /** `YYYY-MM-DD` в часовом поясе бизнеса */
  day: string;
  people: BoardPerson[];
  /**
   * Машин за день.
   *
   * Именно машин, а не участий: машина, которую мыли втроём, — одна.
   * Иначе лист зарплат спорил бы со сводкой о том, сколько машин было в
   * дне, а спор двух экранов об одном числе стоит доверия ко всем
   * остальным.
   */
  units: number;
  outstanding: number;
  paid: number;
};

/** Одна выдача: сколько человек за раз получили деньги из рук в руки. */
export type BoardPayment = {
  key: string;
  paidAt: Date;
  /** за какой рабочий день; пусто у старых выплат — там только отрезок */
  day: string | null;
  periodFrom: Date;
  periodTo: Date;
  /** машин за тот рабочий день, если это ещё известно */
  units: number | null;
  total: number;
  rows: { id: string; staffId: string | null; name: string | null; amount: number }[];
};

export type PayrollBoard = {
  /** от свежего дня к старому */
  days: BoardDay[];
  /** от свежей выдачи к старой */
  payments: BoardPayment[];
  totals: {
    /** сколько сейчас нужно раздать */
    outstanding: number;
    /** скольким людям */
    owedTo: number;
    accrued: number;
    settled: number;
    units: number;
  };
  /** когда рассчитывались в последний раз */
  lastPaidAt: Date | null;
};

/**
 * Итог считается ПО ДНЯМ, а не общей суммой по человеку
 * (`getUnsettledPayroll`). Разница не косметическая: та берёт границу
 * «всё, что раньше последней выплаты», и дневной расчёт за сегодня
 * закрывает ей вчерашний долг, которого никто не отдавал. Здесь итог
 * складывается из тех же строк, которые видно на экране.
 */
export async function getPayrollBoard(
  tenantId: string,
  timezone: string,
  /* Язык подписи строки. Приходит снаружи по той же причине, что у
     поводов: лист зарплат читают из браузера и из приложения, и язык у
     них свой у каждого. */
  locale: string = DEFAULT_LOCALE,
  historyLimit = 120,
): Promise<PayrollBoard> {
  const [days, paidDays, lines, payouts, unitsPerDay] = await Promise.all([
    getUnsettledByDay(tenantId, timezone),
    getPaidByDay(tenantId),
    getUnsettledOrderLines(tenantId, timezone),
    listPayouts(tenantId, historyLimit),
    /* Машины дня считаются отдельно и по машинам, а не сложением
       участий: у совместной работы строк столько, сколько людей, и
       сумма назвала бы одну машину тремя. */
    getUnsettledUnitsByDay(tenantId, timezone),
  ]);

  const paidBy = new Map(paidDays.map((p) => [`${p.staffId}|${p.day}`, p]));

  const linesBy = new Map<string, BoardLine[]>();
  for (const line of lines) {
    const key = `${line.staffId}|${line.day}`;
    const entry: BoardLine = {
      id: line.id,
      title: line.clientKey
        ? `${line.clientKey} · ${serviceNameTerm(line.serviceName, locale)}`
        : serviceNameTerm(line.serviceName, locale),
      price: line.price,
      percent: line.percent,
      earned: line.earned,
      crew: line.crew,
    };
    const bucket = linesBy.get(key);
    if (bucket) bucket.push(entry);
    else linesBy.set(key, [entry]);
  }

  const grouped = new Map<string, BoardPerson[]>();
  for (const row of days) {
    const key = `${row.staffId}|${row.day}`;
    const paid = paidBy.get(key);

    /* Нулевая строка без выплаты — это не зарплата: так выглядит
       владелец, который сам мыл машины по нулевой ставке. Показывать
       ему «0 ֏» отдельной строкой значит хоронить под ней те дни, за
       которые он действительно должен. */
    if (row.earned === 0 && !paid) continue;

    /* Разложение показываем, только если оно сходится со счётчиком дня.
       Половина машин под суммой хуже, чем ни одной: она читается как
       полная и не сходится. */
    const found = linesBy.get(key) ?? [];

    const person: BoardPerson = {
      staffId: row.staffId,
      name: row.name,
      count: row.count,
      earned: row.earned,
      paid: paid?.amount ?? 0,
      paidAt: paid?.paidAt ?? null,
      pctFrom: row.pctFrom,
      pctTo: row.pctTo,
      lines: found.length === row.count ? found : null,
    };

    const bucket = grouped.get(row.day);
    if (bucket) bucket.push(person);
    else grouped.set(row.day, [person]);
  }

  /* Дни сверху вниз, от свежего к старому — как в любой выписке. Внутри
     дня сначала те, кому ещё должны: строка, требующая действия, не
     должна стоять под тремя закрытыми. */
  const board: BoardDay[] = [...grouped.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([day, people]) => {
      people.sort((a, b) => Number(a.earned <= 0) - Number(b.earned <= 0) || b.earned - a.earned);
      return {
        day,
        people,
        units: unitsPerDay.get(day) ?? people.reduce((sum, p) => sum + p.count, 0),
        outstanding: people.reduce((sum, p) => sum + Math.max(0, p.earned), 0),
        paid: people.reduce((sum, p) => sum + p.paid, 0),
      };
    });

  /* Одна выдача — одна запись, сколько бы человек в ней ни было.
     Расчёт с тремя мойщиками за вчера владелец делает одним нажатием и
     помнит его как одно событие; три одинаковых строки подряд он читает
     как три платежа и начинает искать, за что заплатил трижды.

     Склейка идёт по совпадению момента до миллисекунды и рабочего дня —
     такое совпадение не бывает случайным: момент на весь расчёт ставит
     сервер один раз, см. `settleMany`. */
  const payments: BoardPayment[] = [];
  const byStamp = new Map<string, BoardPayment>();

  for (const p of payouts) {
    const period = p.day ?? `${p.periodFrom.getTime()}-${p.periodTo.getTime()}`;
    const stamp = `${p.paidAt.getTime()}|${period}`;
    let payment = byStamp.get(stamp);
    if (!payment) {
      payment = {
        key: stamp,
        paidAt: p.paidAt,
        day: p.day,
        periodFrom: p.periodFrom,
        periodTo: p.periodTo,
        units: 0,
        total: 0,
        rows: [],
      };
      byStamp.set(stamp, payment);
      payments.push(payment);
    }

    payment.rows.push({ id: p.id, staffId: p.staffId, name: p.staffName, amount: p.amount });
    payment.total += p.amount;

    /* Сколько машин было в тот день, продукт помнит только пока день не
       ушёл за черту последнего общего расчёта. Дальше честнее промолчать,
       чем показать число, которого не знаешь.

       Ставится один раз на выдачу, а не складывается по её строкам.
       Складывать нельзя с появлением совместной работы: расчёт с тремя
       людьми за один день прибавил бы одну и ту же машину трижды. */
    const units = p.day ? unitsPerDay.get(p.day) : undefined;
    payment.units = units ?? null;
  }

  const outstanding = board.reduce((sum, d) => sum + d.outstanding, 0);
  const owedTo = new Set(
    board.flatMap((d) => d.people.filter((p) => p.earned > 0).map((p) => p.staffId ?? '—')),
  ).size;

  /* Начислено — до вычета выплат: `getUnsettledByDay` отдаёт уже
     остаток, и чтобы получить начисленное, отданное возвращается
     обратно. Выплачено считаем отдельной суммой, а не разностью:
     отменённая после выплаты машина уводит остаток в минус, и разность
     показала бы выплаченным меньше, чем было отдано на руки. */
  const settled = days.reduce(
    (sum, d) => sum + (paidBy.get(`${d.staffId}|${d.day}`)?.amount ?? 0),
    0,
  );

  return {
    days: board,
    payments,
    totals: {
      outstanding,
      owedTo,
      accrued: days.reduce(
        (sum, d) => sum + d.earned + (paidBy.get(`${d.staffId}|${d.day}`)?.amount ?? 0),
        0,
      ),
      settled,
      units: board.reduce((sum, d) => sum + d.units, 0),
    },
    lastPaidAt: payouts[0]?.paidAt ?? null,
  };
}
