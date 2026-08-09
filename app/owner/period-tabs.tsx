'use client';

import Link from 'next/link';
import { PERIODS, periodHref, type PeriodKey } from './periods';
import { usePendingTab } from '@/components/use-pending-tab';

/** Открытый период приходит с сервера — он же лежит в адресе. */
export function PeriodTabs({ current }: { current: PeriodKey }) {
  const { active, pending, select } = usePendingTab(current);

  return (
    /* Жёлоб с плашкой: выбранное — светлая плитка, а не подчёркнутый
       текст. Так «где я» читается формой, а не оттенком.

       Углы 8 и 6, а не 14 и 10: скругление внутренней плашки должно
       быть меньше внешнего жёлоба ровно на его толщину, иначе между
       двумя дугами остаётся серп фона — самая заметная небрежность в
       любом переключателе.

       На телефоне жёлоб занимает всю ширину — три кнопки делят её
       поровну. На компьютере он стоит в заголовке раздела справа, и
       растягивать его незачем: ширину задают сами слова. */
    <div
      className="flex w-full gap-0.5 rounded-[8px] p-[3px] sm:w-auto"
      style={{ background: 'color-mix(in srgb, var(--board-ink) 7%, transparent)' }}
    >
      {PERIODS.map((x) => (
        <Link
          key={x.key}
          href={periodHref(x.key)}
          onClick={() => select(x.key)}
          aria-current={active === x.key ? 'page' : undefined}
          data-pending={pending && active === x.key ? '' : undefined}
          className="flex-1 rounded-[6px] px-3 py-1.5 text-center text-[13px] transition-colors sm:flex-none"
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
