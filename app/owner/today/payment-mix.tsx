import { Panel } from '@/components/patterns/panel';
import { EmptyState } from '@/components/patterns/states';
import { formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import type { MixSlice } from './model';

/**
 * Чем платили: только те способы, что встретились, по убыванию.
 * Одна полоса на все способы и строки с долями под ней.
 */
export async function PaymentMix({
  slices,
  currency,
  className,
}: {
  slices: MixSlice[];
  currency: string;
  className?: string;
}) {
  const t = await getDict();
  return (
    <Panel className={className} title={t.today.paidWith}>
      {slices.length === 0 ? (
        <EmptyState compact title={t.today.noPayments} />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex h-2 w-full overflow-hidden rounded-sm bg-muted" aria-hidden>
            {slices.map((s) => (
              <span key={s.key} style={{ width: `${Math.max(s.share, 1)}%`, background: s.color }} />
            ))}
          </div>
          <ul className="flex flex-col gap-1.5">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-sm">
                <span className="size-2 shrink-0 rounded-full" style={{ background: s.color }} aria-hidden />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
                <span className="num text-muted-foreground">{s.share}%</span>
                <span className="num w-24 text-right font-medium">{formatMoney(s.value, currency, t.locale)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  );
}
