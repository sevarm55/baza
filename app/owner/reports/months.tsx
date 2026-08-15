import Link from 'next/link';
import { Panel } from '@/components/board';
import { hy } from '@/lib/i18n/hy';

export type MonthRow = {
  key: string;
  name: string;
  href: string;
  current: boolean;
  /** в месяце не было ни одной машины: строка сворачивается */
  empty: boolean;
  count: number;
  revenue: string;
  payroll: string;
  costs: string;
  profit: string;
  loss: boolean;
  kept: number;
};

/**
 * Месяцы подряд, по строке на каждый.
 *
 * Таблица осталась, но перестала быть главным интерфейсом отчёта: она
 * отвечает на «покажи точные числа», а не на «лучше или хуже стало» —
 * на второе отвечает график выше. Поэтому она внизу.
 *
 * Пустой месяц не рисует шесть нулей в ряд. Шесть нулей выглядят как
 * шесть показаний, и глаз честно пытается их прочитать, прежде чем
 * понять, что мойка тогда не работала. Одна строка словами говорит то же
 * самое и не занимает места.
 *
 * Строка открывает свой месяц: из таблицы попадают в разбор, а не
 * наоборот.
 */
export function MonthsTable({
  rows,
  unitOne,
  className,
}: {
  rows: MonthRow[];
  unitOne: string;
  className?: string;
}) {
  return (
    <Panel title={hy.reports.byMonth} count={rows.length} className={className}>
      {/* Телефон: строками. Шесть колонок на экране в ладонь шириной
          превращаются либо в горизонтальную прокрутку, где не видно
          начала строки, либо в кашу. */}
      <div className="board-journal lg:hidden">
        {rows.map((m) => (
          <Link key={m.key} href={m.href} className="flex items-center gap-2.5 px-0.5 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14.5px] font-semibold">{m.name}</span>
              <span
                className="num block truncate text-[12px]"
                style={{ color: 'var(--board-muted)' }}
              >
                {m.empty
                  ? hy.reports.emptyMonth
                  : `${m.count} ${unitOne} · ${m.revenue}`}
              </span>
            </span>
            {!m.empty && (
              <span className="shrink-0 text-end">
                <span
                  className="num block text-[14px] font-semibold"
                  style={{ color: m.loss ? 'var(--warn-on-board)' : undefined }}
                >
                  {m.profit}
                </span>
                <span className="num block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                  {m.kept}%
                </span>
              </span>
            )}
          </Link>
        ))}
      </div>

      <table className="tbl hidden lg:table">
        <thead>
          <tr>
            <th>{hy.reports.month}</th>
            <th className="end">{unitOne}</th>
            <th className="end">{hy.owner.revenue}</th>
            <th className="end">{hy.owner.payrollAccrued}</th>
            <th className="end">{hy.owner.costs}</th>
            <th className="end">{hy.owner.profit}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            /* Без `role` и `tabIndex` на `<tr>`: с ними React молча
               бросает гидратацию поддерева. Клавиатуре служит ссылка в
               первой ячейке — у неё и фокус, и имя. */
            <tr key={m.key} data-on={m.current ? '' : undefined} className="month-row">
              <td>
                <Link href={m.href} className="month-open">
                  {m.name}
                </Link>
              </td>

              {m.empty ? (
                /* Пустой месяц — одна фраза вместо пяти нулей. */
                <td colSpan={5} className="text-center" style={{ color: 'var(--board-muted)' }}>
                  {hy.reports.emptyMonth}
                </td>
              ) : (
                <>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {m.count}
                  </td>
                  <td className="num end">{m.revenue}</td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {m.payroll}
                  </td>
                  <td className="num end" style={{ color: 'var(--board-muted)' }}>
                    {m.costs}
                  </td>
                  {/* Итог месяца и доля в одной ячейке: их читают вместе —
                      «сто тысяч, это сорок процентов», — и разнесённые по
                      столбцам они гоняют глаз туда-обратно. */}
                  <td className="num end">
                    <span
                      className="block font-semibold"
                      style={{ color: m.loss ? 'var(--warn-on-board)' : undefined }}
                    >
                      {m.profit}
                    </span>
                    <span className="block text-[12px]" style={{ color: 'var(--board-muted)' }}>
                      {m.kept}%
                    </span>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}
