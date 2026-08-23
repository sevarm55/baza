'use client';

import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Panel } from '@/components/patterns/panel';
import { Metric } from '@/components/patterns/metric';
import { StatusBadge } from '@/components/patterns/status-badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatMoney } from '@/lib/money';
import { StaffRow } from './staff-row';
import type { DayGroup } from './model';
import { useT } from '@/lib/i18n/client';
import { staffCount, unitCount, unitForms } from '@/lib/i18n/terms';

/** Шапка и ячейки компактной таблицы: одна геометрия на все дни. */
const HEAD = 'h-9 px-4 text-xs font-medium text-muted-foreground';

/**
 * Рабочий день — панелью.
 *
 * Владелец рассчитывается днями, поэтому панель — это день, а люди
 * внутри него. В шапке стоит то, ради чего панель читают: сколько по
 * этому дню осталось отдать. Не «начислено» и не «выплачено» — именно
 * долг: два других числа справочные, и ставить их на то же место значит
 * заставлять выбирать, какое из трёх сейчас важно.
 *
 * Закрытый день сворачивается в строку. Он ничего не требует, и занимать
 * им панель в полный рост — значит хоронить под ним те дни, за которые
 * действительно должны.
 */
export function DayCard({
  group,
  currency,
  unitOne,
  staffRole,
  picked,
  onPick,
  onPickAll,
  onPay,
  busy,
  collapsed = false,
}: {
  group: DayGroup;
  currency: string;
  unitOne: string;
  staffRole: string;
  picked: Set<string>;
  onPick: (key: string, on: boolean) => void;
  onPickAll: (keys: string[]) => void;
  onPay: (keys: string[]) => void;
  busy: boolean;
  /** день закрыт: показываем строкой, пока её не откроют */
  collapsed?: boolean;
}) {
  const t = useT();
  const [open, setOpen] = useState(!collapsed);
  const money = (n: number) => formatMoney(n, currency, t.locale);

  const payable = group.people.filter((p) => p.staffId && p.earned > 0);
  const mine = payable.filter((p) => picked.has(p.key));
  const chosen = mine.reduce((sum, p) => sum + p.earned, 0);

  const heading = (
    <>
      <span>{group.date}</span>
      {group.today && <StatusBadge tone="brand">{t.common.today}</StatusBadge>}
    </>
  );

  if (collapsed && !open) {
    return (
      <Panel padded={false}>
        <button
          type="button"
          className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/50"
          aria-expanded={false}
          onClick={() => setOpen(true)}
        >
          <span className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-semibold">
            {heading}
          </span>
          <StatusBadge tone="success">
            <Check aria-hidden />
            {t.payroll.dayAllPaid}
          </StatusBadge>
          <span className="num ms-auto text-sm font-semibold">{money(group.paid)}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </Panel>
    );
  }

  return (
    <Panel
      padded={false}
      title={heading}
      description={
        <span className="num">
          {staffCount(group.people.length, staffRole, t.locale)} ·{' '}
          {unitCount(group.units, unitOne, t.locale)}
        </span>
      }
      actions={
        <>
          {/* «Выбрать всех» — тихой кнопкой, а не второй рядом с
              расчётом: закрыть день целиком нужно часто, но выбор делает
              человек, и по умолчанию не отмечено ничего. */}
          {payable.length > 1 && mine.length < payable.length && (
            <Button
              variant="ghost"
              size="xs"
              disabled={busy}
              onClick={() => onPickAll(payable.map((p) => p.key))}
            >
              {t.payroll.selectAll}
            </Button>
          )}

          {group.outstanding > 0 ? (
            <Metric
              label={t.payroll.dayToPay}
              value={money(group.outstanding)}
              size="sm"
              className="items-end text-right"
            />
          ) : (
            <StatusBadge tone="success">
              <Check aria-hidden />
              {t.payroll.dayAllPaid}
            </StatusBadge>
          )}
        </>
      }
    >
      {group.people.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t.payroll.dayEmpty}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={`${HEAD} w-10 pr-0`}>
                <span className="sr-only">{t.payroll.selectAll}</span>
              </TableHead>
              {/* Столбец людей назван словом самой мойки («Լվացող»), как
                  и в журнале: заголовок из словаря спорил бы с ним. */}
              <TableHead className={HEAD}>{staffRole}</TableHead>
              <TableHead className={`${HEAD} hidden md:table-cell`}>
                {unitForms(unitOne, t.locale).many}
              </TableHead>
              <TableHead className={`${HEAD} text-right`}>{t.owner.payrollAccrued}</TableHead>
              <TableHead className={`${HEAD} text-right`}>{t.owner.colPayment}</TableHead>
              <TableHead className={`${HEAD} w-10 px-2`}>
                <span className="sr-only">{t.payroll.details}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.people.map((entry) => (
              <StaffRow
                key={entry.key}
                entry={entry}
                currency={currency}
                unitOne={unitOne}
                picked={picked.has(entry.key)}
                onPick={entry.staffId && entry.earned > 0 ? onPick : null}
                onPay={entry.staffId && entry.earned > 0 ? (key) => onPay([key]) : null}
                busy={busy}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {/* Полоса расчёта появляется только когда выбрали. Пустая полоса с
          погашенной кнопкой под каждым днём — обещание действия, которого
          не просили. Сумма стоит на кнопке, а не рядом с ней: число, ради
          которого нажимают, обязано быть там, куда смотрят перед
          нажатием. */}
      {mine.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="num text-sm text-muted-foreground">{t.payroll.selected(mine.length)}</span>
          <Button size="sm" disabled={busy} onClick={() => onPay(mine.map((p) => p.key))}>
            {t.payroll.paySum(money(chosen))}
          </Button>
        </div>
      )}
    </Panel>
  );
}
