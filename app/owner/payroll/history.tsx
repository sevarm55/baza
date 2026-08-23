'use client';

import { History } from 'lucide-react';
import { SectionHeader } from '@/components/patterns/page-header';
import { PersonAvatar } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { TableShell } from '@/components/patterns/table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import type { HistoryDay } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';

/** Шапка и ячейки компактной таблицы: та же геометрия, что у дня. */
const HEAD = 'h-9 px-4 text-xs font-medium text-muted-foreground';
const CELL = 'px-4 py-2.5';

/**
 * История выплат.
 *
 * Две разные сущности названы двумя разными способами и стоят в двух
 * разных местах: когда отдали — заголовок дня и время в строке; за что
 * отдали — подпись «за работу 13 августа» рядом со временем. Одна
 * таблица с колонкой «период» отвечала бы ни на один из вопросов.
 *
 * Группировка идёт по дню ВЫПЛАТЫ: владелец приходит сюда с вопросом
 * «когда я реально отдал деньги», а не «что было начислено». Расчёт с
 * тремя людьми, сделанный одним нажатием, показан одной выпиской — тем,
 * чем он и был.
 */
export function PayrollHistory({
  days,
  currency,
  unitOne,
  staffRole,
}: {
  days: HistoryDay[];
  currency: string;
  unitOne: string;
  staffRole: string;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  if (days.length === 0) {
    return <EmptyState icon={<History />} title={t.payroll.historyEmpty} />;
  }

  return (
    <div className="flex flex-col gap-5" aria-label={t.owner.payoutHistory}>
      {days.map((day) => (
        <section key={day.key}>
          <SectionHeader title={day.title} />
          <TableShell>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={`${HEAD} w-16`}>{t.owner.colTime}</TableHead>
                  <TableHead className={HEAD}>{staffRole}</TableHead>
                  <TableHead className={`${HEAD} text-right`}>{t.payroll.paid}</TableHead>
                </TableRow>
              </TableHeader>

              {/* Каждая выдача — своя группа строк: время и «за какой
                  день» первой строкой, под ней люди, под ними итог. */}
              {day.payments.map((payment) => (
                <TableBody key={payment.key} className="border-b last:border-b-0">
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableCell className={`${CELL} num text-xs font-semibold text-muted-foreground`}>
                      {payment.time}
                    </TableCell>
                    {/* За какой рабочий день — словами, а не второй датой:
                        две даты подряд снова пришлось бы различать по
                        порядку, а не по смыслу. */}
                    <TableCell colSpan={2} className={`${CELL} num text-xs text-muted-foreground`}>
                      {payment.forWork}
                      {payment.units !== null &&
                        payment.units > 0 &&
                        ` · ${unitCount(payment.units, unitOne, t.locale)}`}
                    </TableCell>
                  </TableRow>

                  {payment.rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className={CELL} />
                      <TableCell className={`${CELL} max-w-56`}>
                        <span className="flex min-w-0 items-center gap-2.5">
                          <PersonAvatar name={row.name} size="sm" />
                          <span className="truncate font-medium">{row.name}</span>
                        </span>
                      </TableCell>
                      <TableCell className={`${CELL} num text-right font-semibold`}>{money(row.amount)}</TableCell>
                    </TableRow>
                  ))}

                  {/* Итог — только когда людей несколько: под одной
                      строкой он повторял бы её же число. */}
                  {payment.rows.length > 1 && (
                    <TableRow className="hover:bg-transparent">
                      <TableCell className={CELL} />
                      <TableCell className={`${CELL} text-xs font-medium text-muted-foreground`}>
                        {t.common.total}
                      </TableCell>
                      <TableCell className={`${CELL} num text-right font-semibold`}>{money(payment.total)}</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              ))}
            </Table>
          </TableShell>
        </section>
      ))}
    </div>
  );
}
