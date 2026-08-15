import Link from 'next/link';
import { Panel } from '@/components/board';
import { formatMoney, formatShare } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';

/**
 * Какая часть выручки куда ушла.
 *
 * Шапка отчёта уже называет три суммы — выручку, зарплату и расходы. Их
 * повторение списком было бы тем самым «одно число дважды», от которого
 * ушла сводка дня. Здесь другой вопрос и другой ответ: не «сколько», а
 * «какая доля». Пропорция читается длиной, а не арифметикой в уме, и
 * именно по ней принимают решения — двадцать процентов на людей это
 * норма, сорок это уже разговор о ставках.
 *
 * Одна полоса, а не три кольца и не составной столбик по месяцам: у
 * сегментов общее начало и общая длина, поэтому сравнивать их между
 * собой можно взглядом. Тот же приём, что в разборе записи на сводке.
 *
 * Знаменатель — выручка, пока она покрывает расходы. Когда не покрывает,
 * знаменателем становится сумма затрат: иначе сегменты вылезли бы за сто
 * процентов, и полоса начала бы врать в тот единственный месяц, когда её
 * читают внимательнее всего.
 */
export function ProfitSplit({
  currency,
  revenue,
  payroll,
  costs,
  profit,
  className,
}: {
  currency: string;
  revenue: number;
  payroll: number;
  costs: number;
  profit: number;
  className?: string;
}) {
  const money = (n: number) => formatMoney(n, currency);
  const base = Math.max(revenue, payroll + costs);
  const cut = (n: number) => (base > 0 ? (n / base) * 100 : 0);

  const parts = [
    {
      key: 'payroll',
      label: hy.owner.payrollAccrued,
      value: payroll,
      color: 'var(--tone-teal-glow)',
      href: '/owner/payroll',
    },
    {
      key: 'costs',
      label: hy.owner.costs,
      value: costs,
      color: 'var(--tone-amber-glow)',
      href: '/owner/expenses',
    },
    {
      key: 'profit',
      label: profit >= 0 ? hy.owner.profit : hy.owner.inTheRed,
      value: Math.abs(profit),
      color: profit >= 0 ? 'var(--accent-strong)' : 'var(--bad)',
      href: null,
    },
  ];

  return (
    <Panel title={hy.payroll.details} className={className}>
      {base === 0 ? (
        <p className="py-8 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {hy.reports.emptyMonth}
        </p>
      ) : (
        <>
          <div className="split-bar" aria-hidden>
            <span style={{ width: `${cut(payroll)}%`, background: 'var(--tone-teal-glow)' }} />
            <span style={{ width: `${cut(costs)}%`, background: 'var(--tone-amber-glow)' }} />
            {profit > 0 && (
              <span style={{ width: `${cut(profit)}%`, background: 'var(--accent-strong)' }} />
            )}
          </div>

          <dl className="split-legend">
            {parts.map((p) => (
              <div key={p.key}>
                <dt>
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: p.color }}
                    aria-hidden
                  />
                  {/* Доли людей и расходов ведут туда, где их правят:
                      увидел долю — открыл, из чего она сложилась. */}
                  {p.href ? (
                    <Link href={p.href} className="split-open">
                      {p.label}
                    </Link>
                  ) : (
                    p.label
                  )}
                </dt>
                <dd className="num">
                  {money(p.value)}
                  <b>{formatShare(p.value, base)}%</b>
                </dd>
              </div>
            ))}
          </dl>
        </>
      )}
    </Panel>
  );
}
