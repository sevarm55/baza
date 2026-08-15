'use client';

import { useState } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import { Panel } from '@/components/board';
import { formatMoney } from '@/lib/money';
import { StaffRow } from './staff-row';
import type { DayGroup } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount, staffCount } from '@/lib/i18n/terms';

/**
 * Рабочий день — блоком.
 *
 * Раньше блок назывался именем человека, а внутри лежали суммы за разные
 * дни, и было непонятно, что закрывает кнопка. Владелец же рассчитывается
 * днями, поэтому блок — это день, а люди внутри него.
 *
 * В шапке стоит то, ради чего блок читают: сколько по этому дню осталось
 * отдать. Не «начислено за день» и не «выплачено» — именно долг: два
 * других числа справочные, и ставить их на то же место значит заставлять
 * выбирать, какое из трёх сейчас важно.
 *
 * Закрытый день сворачивается в строку. Он ничего не требует, и занимать
 * им карточку в полный рост — значит хоронить под ним те дни, за которые
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

  if (collapsed && !open) {
    return (
      <Panel>
        <button type="button" className="pay-closed" onClick={() => setOpen(true)}>
          <span className="text-[15px] font-semibold">{group.title}</span>
          <span className="tag-good">
            <Check className="me-1 size-3" aria-hidden />
            {t.payroll.dayAllPaid}
          </span>
          <span className="num ms-auto text-[15px] font-semibold">{money(group.paid)}</span>
          <ChevronRight className="size-4 shrink-0" style={{ color: 'var(--faint)' }} aria-hidden />
        </button>
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          {/* Метки «сегодня» рядом с заголовком нет: слово уже стоит в
              самом заголовке, а плашка, повторяющая соседнее слово, —
              шум, который приходится прочитать, чтобы понять, что он
              ничего не добавляет. */}
          <h2 className="text-[16px] leading-tight font-semibold">{group.title}</h2>
          <p className="num mt-0.5 text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
            {staffCount(group.people.length, staffRole, t.locale)} ·{' '}
            {unitCount(group.units, unitOne, t.locale)}
          </p>
        </div>

        {/* `ms-auto` держит итог у правого края и после переноса: на
            телефоне шапка складывается в две строки, и без него сумма
            дня уезжала бы к левому краю, под заголовок. */}
        <div className="ms-auto flex items-center gap-6">
          {/* «Выбрать всех» — тихой подписью, а не второй кнопкой рядом с
              расчётом: закрыть день целиком нужно часто, но выбор делает
              человек, и по умолчанию не отмечено ничего. */}
          {payable.length > 1 && mine.length < payable.length && (
            <button
              type="button"
              className="text-[12.5px] font-medium underline-offset-2 hover:underline"
              style={{ color: 'var(--board-muted)' }}
              disabled={busy}
              onClick={() => onPickAll(payable.map((p) => p.key))}
            >
              {t.payroll.selectAll}
            </button>
          )}

          <div className="text-end">
            {group.outstanding > 0 ? (
              <>
                <div className="num text-[19px] leading-none font-bold tracking-[-0.03em]">
                  {money(group.outstanding)}
                </div>
                <div className="mt-1 text-[11.5px]" style={{ color: 'var(--board-muted)' }}>
                  {t.payroll.dayToPay}
                </div>
              </>
            ) : (
              <div
                className="flex items-center gap-1.5 text-[13px] font-semibold"
                style={{ color: 'var(--good-on-board)' }}
              >
                <Check className="size-4" aria-hidden />
                {t.payroll.dayAllPaid}
              </div>
            )}
          </div>
        </div>
      </div>

      {group.people.length === 0 ? (
        <p className="py-5 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {t.payroll.dayEmpty}
        </p>
      ) : (
        <div className="board-journal">
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
        </div>
      )}

      {/* Полоса расчёта появляется только когда выбрали. Пустая полоса с
          погашенной кнопкой под каждым днём — обещание действия, которого
          не просили. */}
      {mine.length > 0 && (
        <div className="pay-bar">
          {/* Сумма стоит на кнопке, а не рядом с ней: число, ради
              которого нажимают, обязано быть в том месте, куда смотрят
              перед нажатием, и повторять его дважды незачем. */}
          <span className="num text-[13px]" style={{ color: 'var(--board-muted)' }}>
            {t.payroll.selected(mine.length)}
          </span>
          <button
            type="button"
            className="btn btn-auto"
            disabled={busy}
            onClick={() => onPay(mine.map((p) => p.key))}
          >
            {t.payroll.paySum(money(chosen))}
          </button>
        </div>
      )}
    </Panel>
  );
}
