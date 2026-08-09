'use client';

import Link from 'next/link';
import { PERIODS, periodHref, type PeriodKey } from './periods';
import { usePendingTab } from '@/components/use-pending-tab';

/** Открытый период приходит с сервера — он же лежит в адресе. */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  const { active, pending, select } = usePendingTab(current);

  return (
    /* Капсула, как в приложении: выбранное — плашка на жёлобе, а не
       подчёркнутый текст. Так «где я» читается формой, а не оттенком. */
    <div
      className="mb-3.5 flex gap-1 rounded-[14px] p-1"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
    >
      {PERIODS.map((x) => (
        <Link
          key={x.key}
          href={periodHref(x.key)}
          onClick={() => select(x.key)}
          aria-current={active === x.key ? 'page' : undefined}
          data-pending={pending && active === x.key ? '' : undefined}
          className="flex-1 rounded-[10px] px-3 py-2 text-center text-[13px] transition-colors"
          style={
            active === x.key
              ? { background: 'var(--on-board)', color: 'var(--board)', fontWeight: 600 }
              : { color: 'var(--board-muted)' }
          }
        >
          {x.label}
        </Link>
      ))}
    </div>
  );
}
