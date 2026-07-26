import { hy } from '@/lib/i18n/hy';
import type { Access } from '@/lib/subscription';

/**
 * Напоминание о сроке. Показывается только когда это уместно:
 * постоянная плашка про подписку раздражает и перестаёт читаться.
 */
export function BillingBanner({ access, role }: { access: Access; role: 'owner' | 'staff' }) {
  if (!access.warn) return null;

  if (access.state === 'expired') {
    return (
      <div className="mb-3.5 rounded-[14px] border border-bad-line bg-bad-bg p-3.5">
        <div className="mb-1 text-[15px] font-semibold text-bad-ink">
          {hy.billing.expiredTitle}
        </div>
        <p className="text-[13px] leading-relaxed text-muted">
          {role === 'owner' ? hy.billing.expiredOwner : hy.billing.expiredWorker}
        </p>
        {role === 'owner' && (
          <p className="mt-2 text-[13px] text-bad-ink">{hy.billing.renew}</p>
        )}
      </div>
    );
  }

  // сотруднику про оплату знать незачем — это забота владельца
  if (role !== 'owner') return null;

  return (
    <div className="mb-3.5 rounded-[14px] border border-warn-line bg-warn-bg px-3.5 py-2.5 text-[13px] text-warn-ink">
      {access.state === 'trial'
        ? hy.billing.trialLeft(access.daysLeft)
        : hy.billing.paidLeft(access.daysLeft)}
    </div>
  );
}
