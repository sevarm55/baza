import { Panel } from '@/components/board';
import { formatMoney } from '@/lib/money';
import { hy } from '@/lib/i18n/hy';
import type { MixSlice } from './model';

/**
 * Чем платили.
 *
 * Вопрос, которого на сводке не было вовсе: сколько денег дня лежит в
 * кармане наличными, а сколько придёт на счёт. Раньше на его месте
 * стояла одна цифра «наличными» в ряду быстрых показателей — она
 * называла сумму, но не долю, а решает владелец именно по доле.
 *
 * Строки с полосами, а не кольцо. Способов оплаты два-три, и кольцо на
 * трёх сегментах требует легенды сбоку, то есть читается в два приёма:
 * найти цвет, найти его в списке. Полоса длиной в долю читается сразу, а
 * сумма и процент стоят в той же строке.
 *
 * Пустой день не показывает «0 %» напротив каждого способа: три нуля
 * подряд выглядят как поломка, а сообщают ровно то же, что одна строка
 * словами.
 */
export function PaymentMix({
  className,
  slices,
  currency,
}: {
  className?: string;
  slices: MixSlice[];
  currency: string;
}) {
  return (
    <Panel className={className} title={hy.today.paidWith}>
      {slices.length === 0 ? (
        <p className="py-6 text-center text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
          {hy.today.noPayments}
        </p>
      ) : (
        <div className="grid gap-3">
          {slices.map((s) => (
            <div key={s.key} className="mix">
              <span className="mix-label">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: s.color }}
                  aria-hidden
                />
                <span className="truncate">{s.label}</span>
              </span>
              <span className="num mix-value">{formatMoney(s.value, currency)}</span>
              <span className="num mix-share">{s.share}%</span>
              {/* Полоса прямая, без скруглений: радиус на ленте высотой в
                  шесть пикселей съедает края, и доля выглядит меньше, чем
                  она есть. */}
              <span className="mix-bar" aria-hidden>
                <span style={{ width: `${Math.max(s.share, 2)}%`, background: s.color }} />
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
