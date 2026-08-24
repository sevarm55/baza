import { Clock3, TriangleAlert } from 'lucide-react';

import type { Access } from '@/lib/subscription';
import { getDict } from '@/lib/i18n/server';

/**
 * Напоминание о сроке. Показывается только когда это уместно:
 * постоянная плашка про подписку перестаёт читаться за неделю.
 * Истёкший срок объясняется абзацем во всю ширину; приближающийся
 * одной строкой.
 */
export async function BillingBanner({ access, role }: { access: Access; role: 'owner' | 'staff' }) {
  const t = await getDict();
  if (!access.warn) return null;

  if (access.state === 'expired') {
    return (
      <div
        role="alert"
        className="mb-4 flex gap-3 rounded-lg border border-destructive/30 bg-destructive-soft px-4 py-3 text-sm max-md:rounded-m-tile max-md:border-0 max-md:bg-m-bad/10 max-md:px-4 max-md:py-3.5"
      >
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive max-md:text-m-bad" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold text-destructive-soft-foreground">{t.billing.expiredTitle}</div>
          <p className="mt-0.5 text-muted-foreground">
            {role === 'owner' ? t.billing.expiredOwner : t.billing.expiredWorker}
          </p>
          {role === 'owner' && (
            <p className="mt-1 text-destructive-soft-foreground">{t.billing.renew}</p>
          )}
        </div>
      </div>
    );
  }

  // сотруднику про оплату знать незачем: это забота владельца
  if (role !== 'owner') return null;

  /* На телефоне это фишка того же роста, что фишки периода рядом:
     напоминание живёт в одном ряду с остальными фишками экрана и не
     выглядит аварией. */
  return (
    <div className="mb-4 flex max-md:mb-3">
      <span className="inline-flex items-center gap-2 rounded-md border border-warning/30 bg-warning-soft px-2.5 py-1.5 text-xs font-medium text-warning-soft-foreground max-md:h-10 max-md:rounded-full max-md:border-0 max-md:bg-m-tile max-md:px-4 max-md:text-[13px] max-md:font-semibold max-md:text-m-ink">
        <Clock3 className="size-3.5 shrink-0 max-md:size-4 max-md:text-m-grape" aria-hidden />
        {access.state === 'trial'
          ? t.billing.trialLeft(access.daysLeft)
          : t.billing.paidLeft(access.daysLeft)}
      </span>
    </div>
  );
}
