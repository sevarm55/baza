'use client';

import { formatMoney } from '@/lib/money';
import type { HistoryDay } from './model';
import { useT } from '@/lib/i18n/client';
import { unitCount } from '@/lib/i18n/terms';

/**
 * История выплат.
 *
 * Прежде здесь стояла таблица со столбцом «период»: «13.08 — 14.08».
 * Эта строка не отвечала ни на один вопрос — то ли это дни работы, то
 * ли дни выплат, то ли одна выплата, растянутая на двое суток. Пять
 * строк с одинаковыми датами читались как одна выплата, напечатанная
 * пять раз.
 *
 * Поэтому здесь две разные сущности названы двумя разными способами и
 * стоят в двух разных местах:
 *
 *   когда отдали     → заголовок дня и время слева;
 *   за что отдали    → подпись «за работу 13 августа» под суммой.
 *
 * Группировка идёт по дню ВЫПЛАТЫ: владелец приходит сюда с вопросом
 * «когда я реально отдал деньги», а не «что было начислено». Расчёт с
 * тремя людьми, сделанный одним нажатием, показан одной записью — тем,
 * чем он и был.
 */
export function PayrollHistory({
  days,
  currency,
  unitOne,
}: {
  days: HistoryDay[];
  currency: string;
  unitOne: string;
}) {
  const t = useT();
  const money = (n: number) => formatMoney(n, currency, t.locale);

  if (days.length === 0) {
    return (
      <p className="py-12 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
        {t.payroll.historyEmpty}
      </p>
    );
  }

  return (
    <div className="grid gap-[var(--seam)]" aria-label={t.owner.payoutHistory}>
      {days.map((day) => (
        <section key={day.key}>
          <h2 className="mb-2 px-0.5 text-[13.5px] font-semibold" style={{ color: 'var(--board-muted)' }}>
            {day.title}
          </h2>

          <div className="grid gap-2">
            {day.payments.map((payment) => (
              <div
                key={payment.key}
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-[var(--radius-card)] px-3 py-2.5"
                style={{ background: 'color-mix(in srgb, var(--board-ink) 5%, transparent)' }}
              >
                {/* Время слева отдельной колонкой: по нему история и
                    читается сверху вниз, как выписка. */}
                <span
                  className="num pt-0.5 text-[12.5px] font-semibold"
                  style={{ color: 'var(--board-muted)' }}
                >
                  {payment.time}
                </span>

                <div className="min-w-0">
                  {payment.rows.map((row) => (
                    <div key={row.id} className="flex items-center gap-2 py-0.5">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ background: row.color }}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                        {row.name}
                      </span>
                      <span className="num shrink-0 text-[14px] font-semibold">
                        {money(row.amount)}
                      </span>
                    </div>
                  ))}

                  {/* Итог — только когда людей несколько: под одной
                      строкой он повторял бы её же число. */}
                  {payment.rows.length > 1 && (
                    <div
                      className="mt-1 flex items-center justify-between border-t pt-1.5"
                      style={{ borderColor: 'color-mix(in srgb, var(--board-ink) 10%, transparent)' }}
                    >
                      <span className="text-[12.5px]" style={{ color: 'var(--board-muted)' }}>
                        {t.common.total}
                      </span>
                      <span className="num text-[14.5px] font-bold">{money(payment.total)}</span>
                    </div>
                  )}

                  {/* За какой рабочий день — словами, а не второй датой:
                      две даты подряд снова пришлось бы различать по
                      порядку, а не по смыслу. */}
                  <p className="num mt-1 text-[12px]" style={{ color: 'var(--board-muted)' }}>
                    {payment.forWork}
                    {payment.units !== null &&
                      payment.units > 0 &&
                      ` · ${unitCount(payment.units, unitOne, t.locale)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
