import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { formatShare } from '@/lib/money';

export type BarRow = {
  key: string;
  name: string;
  /** подробность строки: сколько раз, какой это расход */
  note: string;
  value: number;
  /** уже деньгами: считает страница одним форматером на весь продукт */
  money: string;
};

/**
 * Разбивка полосками: из чего сложилась сумма.
 *
 * Доля рисуется, а не только пишется процентом: «аренда это половина
 * всех расходов» видно длиной строки раньше, чем прочитано число.
 * Проценты остаются вторыми, для тех, кому нужна точность.
 *
 * Длина считается от самой большой строки, а не от суммы: при
 * пятнадцати статьях все полоски от суммы были бы короче десятой доли
 * ширины и не отличались бы друг от друга. Процент рядом по-прежнему
 * считается от суммы, он и отвечает на «какая это часть целого».
 */
export function Bars({
  title,
  rows,
  total,
  className,
  empty,
}: {
  title: string;
  rows: BarRow[];
  /** знаменатель для процентов: сумма всего разреза */
  total: number;
  className?: string;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Panel title={title} count={rows.length > 0 ? rows.length : undefined} className={className}>
      {rows.length === 0 ? (
        <EmptyState compact title={empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm font-medium">{r.name}</span>
                <span className="num shrink-0 text-sm font-semibold">{r.money}</span>
              </div>
              <div className="mt-1.5 flex items-center gap-2.5">
                <div className="h-1.5 flex-1 overflow-hidden rounded-sm bg-muted" aria-hidden>
                  <div
                    className="h-full rounded-sm bg-primary"
                    style={{ width: `${Math.round((r.value / max) * 100)}%` }}
                  />
                </div>
                <span className="num shrink-0 text-xs text-muted-foreground">
                  {formatShare(r.value, total)}% · {r.note}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
