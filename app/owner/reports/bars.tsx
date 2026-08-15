import { EmptyState } from '@/components/empty-state';
import { Panel } from '@/components/board';
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
 * Доля рисуется, а не пишется процентом: «аренда — половина всех
 * расходов» видно длиной строки раньше, чем прочитано число. Проценты
 * при этом остаются, но вторыми — для тех, кому нужна точность.
 *
 * Длина считается от САМОЙ БОЛЬШОЙ строки, а не от суммы: при пятнадцати
 * статьях все полоски от суммы были бы короче десятой доли ширины и не
 * отличались бы друг от друга вовсе. Процент рядом по-прежнему считается
 * от суммы — он и отвечает на «какая это часть целого».
 *
 * Цветом величина не передаётся: тон один на весь список и говорит
 * только, про приход это или про расход.
 */
export function Bars({
  title,
  rows,
  total,
  tone,
  className,
  empty,
}: {
  title: string;
  rows: BarRow[];
  /** знаменатель для процентов: сумма всего разреза */
  total: number;
  tone: string;
  className?: string;
  empty: string;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <Panel title={title} count={rows.length > 0 ? rows.length : undefined} className={className}>
      {rows.length === 0 ? (
        <EmptyState title={empty} />
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <div key={r.key}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-[14px] font-medium">{r.name}</span>
                <span className="num shrink-0 text-[14px] font-semibold">{r.money}</span>
              </div>

              <div className="mt-1.5 flex items-center gap-2.5">
                <span
                  className="h-1.5 flex-1 overflow-hidden rounded-[3px]"
                  style={{ background: 'color-mix(in srgb, var(--board-ink) 8%, transparent)' }}
                >
                  <span
                    className="block h-full rounded-[3px]"
                    style={{ width: `${Math.round((r.value / max) * 100)}%`, background: tone }}
                  />
                </span>
                <span
                  className="num shrink-0 text-[12px] tabular-nums"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {formatShare(r.value, total)}% · {r.note}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
