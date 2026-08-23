import Link from 'next/link';
import { TableShell, cellMuted, cellNum, headNum } from '@/components/patterns/table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getDict } from '@/lib/i18n/server';
import { unitForms } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';

export type MonthRow = {
  key: string;
  name: string;
  href: string;
  current: boolean;
  /** в месяце не было ни машины, ни расхода: строка сворачивается */
  empty: boolean;
  count: number;
  revenue: string;
  payroll: string;
  costs: string;
  profit: string;
  /** итог ушёл в минус: считает страница, а не таблица */
  loss: boolean;
  kept: number;
};

/**
 * Месяцы подряд, по строке на каждый.
 *
 * Таблица отвечает на «покажи точные числа», а не на «лучше или хуже
 * стало»: на второе отвечает график выше. Поэтому она внизу.
 *
 * Пустой месяц не рисует шесть нулей в ряд: шесть нулей выглядят как
 * шесть показаний, и глаз честно пытается их прочитать, прежде чем
 * понять, что мойка тогда не работала. Одна фраза говорит то же самое.
 *
 * Строка открывает свой месяц ссылкой в первой ячейке: у неё и фокус,
 * и имя, а на `<tr>` ни роли, ни `tabIndex`.
 */
export async function MonthsTable({
  rows,
  unitOne,
  className,
}: {
  rows: MonthRow[];
  unitOne: string;
  className?: string;
}) {
  const t = await getDict();
  const head = 'h-9 px-4 text-xs text-muted-foreground';
  const cell = 'px-4 py-2.5';

  return (
    <TableShell title={t.reports.byMonth} className={className}>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className={head}>{t.reports.month}</TableHead>
            <TableHead className={cn(head, headNum, 'hidden sm:table-cell')}>
              {unitForms(unitOne, t.locale).many}
            </TableHead>
            <TableHead className={cn(head, headNum)}>{t.owner.revenue}</TableHead>
            <TableHead className={cn(head, headNum, 'hidden md:table-cell')}>
              {t.owner.payrollAccrued}
            </TableHead>
            <TableHead className={cn(head, headNum, 'hidden md:table-cell')}>
              {t.owner.costs}
            </TableHead>
            <TableHead className={cn(head, headNum)}>{t.owner.profit}</TableHead>
            <TableHead className={cn(head, headNum)}>{t.owner.kept}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.key} className={cn(m.current && 'bg-primary-soft/40 hover:bg-primary-soft/40')}>
              <TableCell className={cn(cell, 'font-medium')}>
                <Link
                  href={m.href}
                  aria-current={m.current ? 'page' : undefined}
                  className="underline-offset-4 hover:text-primary hover:underline"
                >
                  {m.name}
                </Link>
              </TableCell>

              {m.empty ? (
                <TableCell colSpan={6} className={cn(cell, cellMuted, 'text-center')}>
                  {t.reports.emptyMonth}
                </TableCell>
              ) : (
                <>
                  <TableCell className={cn(cell, cellNum, cellMuted, 'hidden sm:table-cell')}>
                    {m.count}
                  </TableCell>
                  <TableCell className={cn(cell, cellNum)}>{m.revenue}</TableCell>
                  <TableCell className={cn(cell, cellNum, cellMuted, 'hidden md:table-cell')}>
                    {m.payroll}
                  </TableCell>
                  <TableCell className={cn(cell, cellNum, cellMuted, 'hidden md:table-cell')}>
                    {m.costs}
                  </TableCell>
                  <TableCell
                    className={cn(cell, cellNum, 'font-semibold', m.loss && 'text-destructive')}
                  >
                    {m.profit}
                  </TableCell>
                  <TableCell className={cn(cell, cellNum, cellMuted)}>{m.kept}%</TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableShell>
  );
}
