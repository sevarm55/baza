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
      <div className="mb-3.5 rounded-[14px] border border-[#6b2b31] bg-[#2a1416] p-3.5">
        <div className="mb-1 text-[15px] font-semibold text-[#ffb4b8]">
          {hy.billing.expiredTitle}
        </div>
        <p className="text-[13px] leading-relaxed text-muted">
          {role === 'owner' ? hy.billing.expiredOwner : hy.billing.expiredWorker}
        </p>
        {role === 'owner' && (
          <p className="mt-2 text-[13px] text-[#ffb4b8]">{hy.billing.renew}</p>
        )}
      </div>
    );
  }

  // сотруднику про оплату знать незачем — это забота владельца
  if (role !== 'owner') return null;

  return (
    <div className="mb-3.5 rounded-[14px] border border-[#3a2a10] bg-[#241a08] px-3.5 py-2.5 text-[13px] text-warn">
      {access.state === 'trial'
        ? hy.billing.trialLeft(access.daysLeft)
        : hy.billing.paidLeft(access.daysLeft)}
    </div>
  );
}
