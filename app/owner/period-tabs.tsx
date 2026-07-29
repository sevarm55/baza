'use client';

import Link from 'next/link';
import { PERIODS, periodHref, type PeriodKey } from './periods';
import { usePendingTab } from '@/components/use-pending-tab';

/** Открытый период приходит с сервера — он же лежит в адресе. */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  const { active, pending, select } = usePendingTab(current);

  return (
    <div className="mb-4 flex gap-1.5">
      {PERIODS.map((x) => (
        <Link
          key={x.key}
          href={periodHref(x.key)}
          onClick={() => select(x.key)}
          aria-current={active === x.key ? 'page' : undefined}
          data-pending={pending && active === x.key ? '' : undefined}
          className={`rounded-[10px] px-3 py-1.5 text-[13px] transition-colors ${
            active === x.key
              ? 'bg-surface2 font-semibold text-ink'
              : 'text-muted hover:text-ink'
          }`}
        >
          {x.label}
        </Link>
      ))}
    </div>
  );
}
