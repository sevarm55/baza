'use client';

import { useState, useTransition } from 'react';
import { CheckCircle2, ChevronRight, X } from 'lucide-react';
import { markPaid } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * «Выплачено» на плитке человека.
 *
 * Заливка — фиолетовый акцент продукта, надпись на нём белая. Стояли
 * чернила `--tone-ink-on-lime`: они рассчитаны на лайм, а на глубоком
 * фиолетовом дают почти чёрное на почти чёрном — кнопку было видно, а
 * прочитать нельзя. Цвет надписи обязан следовать за заливкой, а не за
 * тем, какой она была раньше.
 */
export function PayButton({
  staffId,
  label,
  name,
  amount,
  /**
   * До какого дня закрываем долг, `YYYY-MM-DD`.
   *
   * Без него — весь накопленный, как было. С ним закрываются этот день и
   * все, что старше: долги гасят с самого старого, и «заплатить за
   * среду, оставив вторник» — не случай из жизни, а способ запутаться.
   * Поэтому на кнопке написано «по такое-то число», а не «за него».
   */
  throughDay,
  /** Строка дня: маленькая кнопка вместо широкой плашки. */
  compact = false,
}: {
  staffId: string;
  label: string;
  name: string;
  amount: string;
  throughDay?: string;
  compact?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <button
        type="button"
        className={
          compact
            ? 'rounded-[8px] px-2 py-1 text-[11.5px] font-semibold whitespace-nowrap outline-none transition hover:bg-surface2 focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50'
            : 'flex w-full items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--accent2)] px-3.5 py-3 text-[13.5px] font-bold text-white outline-none transition duration-150 hover:brightness-95 active:translate-y-px focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-50'
        }
        style={compact ? { color: 'var(--accent)' } : undefined}
        disabled={pending}
        onClick={() => setConfirming(true)}
      >
        {!compact && <CheckCircle2 className="size-4" aria-hidden />}
        <span>{pending ? hy.common.loading : label}</span>
        {!compact && <ChevronRight className="ms-auto size-4" aria-hidden />}
      </button>

      {confirming && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-[3px]"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !pending) setConfirming(false);
          }}
        >
          <section
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`pay-${staffId}`}
            className="w-full max-w-[390px] rounded-[22px] bg-[var(--board)] p-5 text-[var(--on-board)] shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[12px] font-semibold tracking-[0.08em] text-[var(--board-muted)] uppercase">
                  {hy.owner.payrollDue}
                </p>
                <h2 id={`pay-${staffId}`} className="mt-2 text-[21px] leading-tight font-bold">
                  {name}
                </h2>
              </div>
              <button
                type="button"
                aria-label={hy.common.cancel}
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="grid size-9 place-items-center rounded-[11px] bg-[color-mix(in_srgb,var(--board-ink)_7%,transparent)] transition hover:bg-[color-mix(in_srgb,var(--board-ink)_11%,transparent)]"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="num mt-7 text-[36px] leading-none font-bold tracking-[-0.04em]">{amount}</div>
            <p className="mt-2 text-[13px] text-[var(--board-muted)]">
              Վճարումը կհայտնվի պատմության մեջ։
            </p>

            <div className="mt-7 grid grid-cols-2 gap-2.5">
              <button
                type="button"
                className="rounded-[13px] bg-[color-mix(in_srgb,var(--board-ink)_7%,transparent)] px-4 py-3 text-[13.5px] font-semibold transition hover:bg-[color-mix(in_srgb,var(--board-ink)_11%,transparent)]"
                onClick={() => setConfirming(false)}
                disabled={pending}
              >
                {hy.common.cancel}
              </button>
              <button
                type="button"
                className="rounded-[13px] bg-[var(--accent2)] px-4 py-3 text-[13.5px] font-bold text-white transition hover:brightness-95 active:translate-y-px disabled:opacity-60"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    await markPaid(staffId, throughDay);
                    setConfirming(false);
                  })
                }
              >
                {pending ? hy.common.loading : 'Հաստատել'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
