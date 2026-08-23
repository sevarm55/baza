import Link from 'next/link';
import { Ban, Percent, UserX, Wallet } from 'lucide-react';
import type { ReactNode } from 'react';

import { getDict } from '@/lib/i18n/server';
import { cn } from '@/lib/utils';

export type Signal = {
  key: string;
  tone: 'warning' | 'danger' | 'neutral';
  icon: 'discount' | 'cancel' | 'cash' | 'nobody';
  text: string;
  href: string;
};

const ICON: Record<Signal['icon'], ReactNode> = {
  discount: <Percent aria-hidden />,
  cancel: <Ban aria-hidden />,
  cash: <Wallet aria-hidden />,
  nobody: <UserX aria-hidden />,
};

/**
 * Что необычного сегодня: скидки, отмены, расхождение наличных, пустая
 * смена в рабочее время. Одна строка чипов, и только когда есть что
 * сказать: в обычный день владелец её не видит вовсе. Каждый чип ведёт
 * туда, где это разбирают.
 */
export async function Attention({ signals }: { signals: Signal[] }) {
  const t = await getDict();
  if (signals.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" role="status" aria-label={t.today.attention}>
      <span className="text-2xs font-medium tracking-wider text-muted-foreground uppercase">
        {t.today.attention}
      </span>
      {signals.map((s) => (
        <Link
          key={s.key}
          href={s.href}
          className={cn(
            'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors [&_svg]:size-3.5',
            s.tone === 'danger' &&
              'border-destructive/30 bg-destructive-soft text-destructive-soft-foreground hover:bg-destructive-soft/70',
            s.tone === 'warning' &&
              'border-warning/30 bg-warning-soft text-warning-soft-foreground hover:bg-warning-soft/70',
            s.tone === 'neutral' && 'border-border bg-card text-foreground hover:bg-muted',
          )}
        >
          {ICON[s.icon]}
          <span className="num">{s.text}</span>
        </Link>
      ))}
    </div>
  );
}
