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
      <div className="mb-3.5 rounded-[var(--radius-sm)] border border-bad-line bg-bad-bg p-3.5">
        <div className="mb-1 text-[15px] font-semibold text-bad-ink">
          {hy.billing.expiredTitle}
        </div>
        <p className="text-[13.5px] leading-relaxed text-muted">
          {role === 'owner' ? hy.billing.expiredOwner : hy.billing.expiredWorker}
        </p>
        {role === 'owner' && (
          <p className="mt-2 text-[13.5px] text-bad-ink">{hy.billing.renew}</p>
        )}
      </div>
    );
  }

  // сотруднику про оплату знать незачем — это забота владельца
  if (role !== 'owner') return null;

  /* Фишкой, а не полосой во всю ширину.

     Предупреждение о сроке занимало ленту в шестьдесят пикселей поверх
     всего экрана — столько же, сколько показание, ради которого кабинет
     открывают. При этом сказать ему нужно одно короткое предложение, и
     висит оно там неделями. Полоса такой ширины на второй день
     перестаёт читаться и просто отнимает верх экрана.

     Срок кончился — другое дело: там доступ уже закрыт, и объяснять
     надо целым абзацем. Та плашка осталась во всю ширину. */
  return (
    <div className="mb-2.5 flex">
      <span className="inline-flex items-center gap-2 rounded-[var(--radius-chip)] border border-warn-line bg-warn-bg px-2.5 py-1.5 text-[12.5px] text-warn-ink">
        <svg viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <circle cx="8" cy="8" r="5.75" />
          <path d="M8 5v3.4l2 1.4" />
        </svg>
        {access.state === 'trial'
          ? hy.billing.trialLeft(access.daysLeft)
          : hy.billing.paidLeft(access.daysLeft)}
      </span>
    </div>
  );
}
