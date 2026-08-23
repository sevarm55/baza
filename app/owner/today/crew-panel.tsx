import { Panel } from '@/components/patterns/panel';
import { PersonAvatar } from '@/components/patterns/person';
import { EmptyState } from '@/components/patterns/states';
import { StatusBadge } from '@/components/patterns/status-badge';
import { formatMoney } from '@/lib/money';
import { getDict } from '@/lib/i18n/server';
import { unitCount } from '@/lib/i18n/terms';
import { cn } from '@/lib/utils';
import type { CrewMember } from './model';

/**
 * Кто работает: сначала те, кто на смене, потом отработавшие. У
 * человека на смене час выхода и число машин, справа заработок.
 */
export async function CrewPanel({
  crew,
  currency,
  unitOne,
  title,
  className,
}: {
  crew: CrewMember[];
  currency: string;
  unitOne: string;
  title: string;
  className?: string;
}) {
  const t = await getDict();
  const money = (n: number) => formatMoney(n, currency, t.locale);
  const present = crew.filter((s) => s.present).length;

  return (
    <Panel
      className={className}
      title={title}
      count={crew.length > 0 ? crew.length : undefined}
      actions={present > 0 ? <StatusBadge tone="success" dot>{t.owner.onShift} · {present}</StatusBadge> : undefined}
      padded={false}
    >
      {crew.length === 0 ? (
        <EmptyState compact title={t.today.nobodyOnShift} />
      ) : (
        <ul className="divide-y divide-border">
          {crew.map((s) => (
            <li key={s.staffId ?? `noname-${s.name}`} className="flex items-center gap-3 px-4 py-2.5">
              <PersonAvatar name={s.name} size="md" className={cn(!s.present && 'opacity-60')} />
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-sm font-medium', !s.present && 'text-muted-foreground')} title={s.name}>
                  {s.name}
                </span>
                <span className="num block truncate text-xs text-muted-foreground">
                  {s.since && `${t.today.since(s.since)} · `}
                  {unitCount(s.count, unitOne, t.locale)}
                </span>
              </span>
              <span className="num shrink-0 text-sm font-semibold">{money(s.earned)}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
