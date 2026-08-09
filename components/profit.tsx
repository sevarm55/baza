import { hy } from '@/lib/i18n/hy';

/**
 * Лестница: из чего сложилась прибыль.
 *
 * Форма выбрана не на вкус. Так устроен отчёт о прибылях у Wave,
 * FreshBooks, Zoho, Xero и QuickBooks, у Lightspeed («starting with your
 * Gross sales, listing your deductions, and ending with your Net sales»),
 * у Poster и МоегоСклада: строка на каждый вычет, промежуточный итог и
 * ответ под чертой.
 *
 * Водопад и составной столбик рассматривались и отброшены. У NN/g составной
 * столбик — график с наивысшим процентом ошибок чтения: у сегментов нет
 * общего начала. Водопад требует объяснения и тоже теряет общую ось. Три
 * шага не окупают обучение новому типу графика.
 *
 * Единственная количественная кодировка — длина полоски от общего левого
 * края. Цветом величина не передаётся: у NN/g это прямой запрет, и до
 * восьми процентов мужчин различают оттенки хуже.
 */
export function Profit({
  revenue,
  payroll,
  oneOff,
  monthlyShare,
  profit,
  daily,
  money,
}: {
  revenue: number;
  payroll: number;
  /** разовые траты периода */
  oneOff: number;
  /** постоянные: доля дня или вся сумма месяца — зависит от периода */
  monthlyShare: number;
  profit: number;
  /** сутки или месяц: от этого зависит только подпись под расходами */
  daily: boolean;
  money: (n: number) => string;
}) {
  const expenses = oneOff + monthlyShare;
  const afterPayroll = revenue - payroll;

  // длина полоски — доля от выручки; при нулевой выручке полосок нет вовсе
  const bar = (n: number) => (revenue > 0 ? Math.max(1, Math.round((n / revenue) * 100)) : 0);

  /* Подложку даёт тот, кто ставит лестницу на страницу: рядом с другими
     приборами она живёт внутри общего прибора, и вторая подложка
     нарисовала бы карточку в карточке. */
  return (
    <div>
      <Row label={hy.owner.revenue} value={money(revenue)} width={bar(revenue)} strong />

      <Row
        label={hy.owner.payrollAccrued}
        value={money(payroll)}
        width={bar(payroll)}
        minus
      />

      {/* Промежуточный итог есть во всех пяти изученных отчётах. Это фраза,
          а не термин: третье существительное рядом с «Հասույթ» — ровно та
          беда, в которую попал Poster с пятью словами про оборот. */}
      <div
        className="mt-1 mb-2 flex justify-between gap-3 ps-3 text-[12px]"
        style={{ color: 'var(--board-muted)', opacity: 0.85 }}
      >
        <span>{hy.owner.afterPayroll}</span>
        <span className="num">{money(afterPayroll)}</span>
      </div>

      <Row label={hy.owner.expensesTotal} value={money(expenses)} width={bar(expenses)} minus />

      {/* Расходы разложены на разовые и постоянные. Без этого владелец
          скажет «я сегодня столько не тратил» — и будет прав: в сумме
          сидит доля аренды, а не сегодняшний платёж. */}
      {expenses > 0 && (
        <div
          className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 ps-3 text-[12px]"
          style={{ color: 'var(--board-muted)', opacity: 0.85 }}
        >
          {oneOff > 0 && (
            <span>
              {hy.expenses.oneOff} <span className="num">{money(oneOff)}</span>
            </span>
          )}
          {monthlyShare > 0 && (
            <span>
              {daily ? hy.owner.dailyShare : hy.expenses.monthly}{' '}
              <span className="num">{money(monthlyShare)}</span>
            </span>
          )}
        </div>
      )}

      <div
        className="mt-3 flex items-baseline justify-between gap-3 pt-3"
        style={{ borderTop: '1px solid color-mix(in srgb, var(--board-ink) 10%, transparent)' }}
      >
        <span className="label">{profit >= 0 ? hy.owner.profit : hy.owner.inTheRed}</span>
        {/* убыток жёлтым, а не красным: красный в продукте значит
            «удалить», и путать эти два сигнала нельзя */}
        <span
          className={`num text-[26px] leading-none font-bold ${
            profit >= 0 ? 'text-good' : 'text-warn'
          }`}
        >
          {money(Math.abs(profit))}
        </span>
      </div>
    </div>
  );
}

/**
 * Строка лестницы: подпись, сумма, полоска.
 *
 * Знак «−» стоит перед подписью, а не внутри числа: «− Аренда 4 060»
 * читается как действие вычитания, «Аренда −4 060» — как свойство суммы.
 */
function Row({
  label,
  value,
  width,
  minus,
  strong,
}: {
  label: string;
  value: string;
  width: number;
  minus?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="mt-1.5 first:mt-0">
      <div className="flex justify-between gap-3 text-[13.5px]">
        <span
          className={strong ? 'font-semibold' : undefined}
          style={strong ? undefined : { color: 'var(--board-muted)' }}
        >
          {minus && <span style={{ opacity: 0.7 }}>− </span>}
          {label}
        </span>
        <span
          className={`num ${strong ? 'font-semibold' : ''}`}
          style={strong ? undefined : { color: 'var(--board-muted)' }}
        >
          {value}
        </span>
      </div>
      {/* Полоска — единственная величина, переданная длиной. Жёлоб и
          сама полоска берут чернила полотна: тона страницы под ними
          выцветают в грязь. */}
      <div
        className="mt-1 h-[3px] rounded-[2px]"
        style={{ background: 'color-mix(in srgb, var(--board-ink) 8%, transparent)' }}
      >
        <div
          className="h-full rounded-[2px]"
          style={{
            width: `${width}%`,
            background: strong
              ? 'var(--on-board)'
              : 'color-mix(in srgb, var(--board-ink) 25%, transparent)',
          }}
        />
      </div>
    </div>
  );
}
