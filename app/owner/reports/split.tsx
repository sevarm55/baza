import Link from 'next/link';
import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { formatMoney, formatShare } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';

/**
 * Какая часть выручки куда ушла.
 *
 * Полоса показаний уже называет три суммы: выручку, зарплату и
 * расходы. Здесь другой вопрос и другой ответ: не «сколько», а «какая
 * доля». Пропорция читается длиной, а не арифметикой в уме, и именно
 * по ней принимают решения: двадцать процентов на людей это норма,
 * сорок это уже разговор о ставках.
 *
 * Одна полоса, а не три кольца: у сегментов общее начало и общая
 * длина, поэтому сравнивать их можно взглядом.
 *
 * Знаменатель выручка, пока она покрывает расходы. Когда не покрывает,
 * знаменателем становится сумма затрат: иначе сегменты вылезли бы за
 * сто процентов в тот единственный месяц, когда полосу читают
 * внимательнее всего.
 */
export async function ProfitSplit({
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
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const base = Math.max(revenue, payroll + costs);
  const cut = (n: number) => (base > 0 ? (n / base) * 100 : 0);
  const loss = profit < 0;

  const parts = [
    {
      key: 'payroll',
      label: t.owner.payrollAccrued,
      value: payroll,
      color: 'var(--chart-2)',
      href: '/owner/payroll',
      loss: false,
    },
    {
      key: 'costs',
      label: t.owner.costs,
      value: costs,
      color: 'var(--chart-4)',
      href: '/owner/expenses',
      loss: false,
    },
    {
      key: 'profit',
      label: loss ? t.owner.inTheRed : t.owner.profit,
      value: Math.abs(profit),
      color: loss ? 'var(--destructive)' : 'var(--chart-1)',
      href: null,
      loss,
    },
  ];

  return (
    <Panel title={t.payroll.details} className={className}>
      {base === 0 ? (
        <EmptyState compact title={t.reports.emptyMonth} />
      ) : (
        <div className="flex flex-col gap-3">
          {/* Убыток в полосе не рисуется: затраты уже заняли её целиком,
              и ему просто негде быть. Он остаётся строкой ниже. */}
          <div className="flex h-2 w-full overflow-hidden rounded-sm bg-muted" aria-hidden>
            {parts
              .filter((p) => p.value > 0 && !p.loss)
              .map((p) => (
                <span key={p.key} style={{ width: `${cut(p.value)}%`, background: p.color }} />
              ))}
          </div>

          <ul className="flex flex-col gap-1.5">
            {parts.map((p) => (
              <li key={p.key} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: p.color }}
                  aria-hidden
                />
                {/* Доли людей и расходов ведут туда, где их правят:
                    увидел долю, открыл, из чего она сложилась. */}
                <span className="min-w-0 flex-1 truncate">
                  {p.href ? (
                    <Link
                      href={p.href}
                      className="underline-offset-4 hover:text-primary hover:underline"
                    >
                      {p.label}
                    </Link>
                  ) : (
                    p.label
                  )}
                </span>
                <span className="num text-muted-foreground">{formatShare(p.value, base)}%</span>
                <span className={cn('num w-24 text-right font-medium', p.loss && 'text-destructive')}>
                  {money(p.value)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
