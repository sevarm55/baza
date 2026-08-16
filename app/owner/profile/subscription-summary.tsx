import type { Access } from '@/lib/subscription';
import { Panel } from '@/components/board';
import { getDict } from '@/lib/i18n/server';

/**
 * Срок подписки — сводкой, а не плиткой.
 *
 * Здесь стоял прибор со свечением: тёмная цветная плита в правой
 * колонке. На своих страницах — на сводке, у зарплат — такая плитка
 * права: там она показание, ради которого экран открыли. В профиле
 * главное — сам человек и ключ от его входа, а срок оплаты владелец
 * видит и без того: за пять дней до конца в шапке каждой страницы
 * кабинета зажигается напоминание (`BillingBanner`). Плита здесь
 * кричала громче имени и громче безопасности.
 *
 * Осталась строка состояния с цветной точкой — тем же знаком, которым в
 * продукте помечен человек на смене: горит спокойным, когда срок в
 * порядке, и янтарным, когда пора платить. Цвет при этом не
 * единственный носитель — рядом стоят слова.
 *
 * Кнопки «управлять подпиской» тут нет, потому что управлять ею внутри
 * продукта нельзя: продление идёт разговором. Обещать несуществующую
 * страницу — хуже, чем промолчать.
 */
export async function SubscriptionSummary({
  access,
  businessName,
  owner,
}: {
  access: Access;
  businessName: string;
  /** работнику про оплату знать незачем — ему видно только имя бизнеса */
  owner: boolean;
}) {
  const t = await getDict();

  if (!owner) {
    return (
      <Panel title={t.settings.business}>
        <div className="text-[15px] font-semibold">{businessName}</div>
      </Panel>
    );
  }

  const state =
    access.state === 'trial'
      ? t.billing.trialLeft(access.daysLeft)
      : access.state === 'active'
        ? t.billing.paidLeft(access.daysLeft)
        : t.billing.expiredTitle;

  return (
    <Panel title={t.profile.access}>
      <p className={access.warn ? 'hint-warn' : 'hint-good'}>{state}</p>
      <p className="mt-2 text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
        {businessName}
      </p>
      {access.warn && (
        <p className="note mt-3">
          {t.billing.renew} <span className="num">{t.billing.wallPhone}</span>
        </p>
      )}
    </Panel>
  );
}
