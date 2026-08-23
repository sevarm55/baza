import { Panel } from '@/components/patterns/panel';
import { StatusBadge, type StatusTone } from '@/components/patterns/status-badge';
import { getDict } from '@/lib/i18n/server';
import type { Access } from '@/lib/subscription';

/**
 * Срок подписки сводкой, а не плитой.
 *
 * В профиле главное сам человек и ключ от его входа, а срок оплаты
 * владелец видит и без того: за несколько дней до конца в шапке каждой
 * страницы зажигается напоминание. Здесь строка состояния со значком и
 * название бизнеса. Кнопки «управлять подпиской» нет: продление идёт
 * разговором, и обещать несуществующую страницу хуже, чем промолчать.
 */
export async function SubscriptionSummary({
  access,
  businessName,
  owner,
  id,
}: {
  access: Access;
  businessName: string;
  /** работнику про оплату знать незачем: ему видно только имя бизнеса */
  owner: boolean;
  id?: string;
}) {
  const t = await getDict();

  if (!owner) {
    return (
      <Panel id={id} title={t.settings.business} className="scroll-mt-16">
        <p className="text-sm font-medium">{businessName}</p>
      </Panel>
    );
  }

  const state =
    access.state === 'trial'
      ? t.billing.trialLeft(access.daysLeft)
      : access.state === 'active'
        ? t.billing.paidLeft(access.daysLeft)
        : t.billing.expiredTitle;

  const tone: StatusTone = !access.canWrite
    ? 'danger'
    : access.warn
      ? 'warning'
      : access.state === 'trial'
        ? 'brand'
        : 'success';

  return (
    <Panel id={id} title={t.profile.access} className="scroll-mt-16">
      <div className="flex flex-col items-start gap-2">
        <StatusBadge tone={tone} dot>
          {state}
        </StatusBadge>
        <p className="text-sm font-medium">{businessName}</p>
        {access.warn && (
          <p className="text-xs text-muted-foreground">
            {t.billing.renew} <span className="num">{t.billing.wallPhone}</span>
          </p>
        )}
      </div>
    </Panel>
  );
}
