import { redirect } from 'next/navigation';
import { rememberedLoginEnabled, requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { formatPhone, maskPhone } from '@/lib/phone';
import { personColor } from '@/lib/person-color';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { SignOutButton } from '@/components/sign-out-button';
import { ValueRow } from '@/components/value-row';
import { accountOf } from '@/lib/accounts';
import { hasPin } from '@/lib/pin';
import { NameForm } from './name-form';
import { PinCard } from './pin-card';
import { SubscriptionSummary } from './subscription-summary';
import { ThemePicker } from './theme-picker';
import { VerifyPhonePanel } from './verify-phone-panel';
import { RememberLoginToggle } from './remember-login-toggle';
import { getDict } from '@/lib/i18n/server';
import { LanguagePicker } from '@/components/language-picker';
import { localizeTenant } from '@/lib/i18n/terms';

/**
 * Мой профиль — личный кабинет внутри рабочего.
 *
 * Страница была стопкой одинаковых серых приборов без имён: карточка
 * человека, раскрытая форма смены PIN, плитка подписки, «это
 * устройство» с языком внутри. Ни один из них не назывался, и разобрать,
 * где данные о себе, где ключ от входа, а где настройка своего экрана,
 * можно было только прочитав их все.
 *
 * Теперь четыре названных раздела, и каждый отвечает на свой вопрос:
 *
 *   личные данные — кто я и как со мной связаться;
 *   безопасность  — чем закрыт мой вход;
 *   интерфейс     — как выглядит мой экран;
 *   аккаунт       — как отсюда выйти.
 *
 * Слева то, что принадлежит человеку и правится редко, но всерьёз;
 * справа — то, что меняют на бегу, и сводка по сроку оплаты. Мера
 * страницы у́же общей меры кабинета: здесь нет ни таблиц, ни списков, а
 * поле ввода шириной в метр читается как ошибка вёрстки.
 */
export default async function ProfilePage() {
  const t = await getDict();
  const session = await requireSession();
  await ensureDb();

  const [raw, me, rememberLogin] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
    rememberedLoginEnabled(),
  ]);
  if (!raw || !me) redirect('/session-ended');

  /* Слова бизнеса — на языке того, кто смотрит; заводские переводятся,
     своё название владельца проходит насквозь (см. terms.ts). */
  const tenant = localizeTenant(raw, t.locale);

  /* Подтверждён ли номер — свойство человека, а не его работы на
     точке. Панель показывается только тем, у кого он не подтверждён. */
  const account = await accountOf(me);

  const access = currentAccess(tenant);
  const owner = session.role === 'owner';

  return (
    <div className="page-narrow">
      <PageHead title={t.profile.title} meta={t.profile.lead} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-7">
          <Panel title={t.profile.personal}>
            {/* Кто вошёл. Цвет точки — тот же, которым этот человек
                помечен в ленте и на смене. */}
            <div className="flex items-center gap-3.5">
              <span
                className="flex size-11 shrink-0 items-center justify-center rounded-[var(--radius-sm)] text-[15px] font-bold"
                style={{
                  color: personColor(me.name),
                  background: `color-mix(in srgb, ${personColor(me.name)} 16%, transparent)`,
                }}
                aria-hidden
              >
                {initials(me.name)}
              </span>
              <div className="min-w-0">
                <div className="truncate text-[20px] leading-tight font-bold">{me.name}</div>
                <div className="truncate text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                  {owner ? t.roles.owner : tenant.staffRole}
                </div>
              </div>
            </div>

            {/* Имя правится, телефон — нет, и выглядят они по-разному
                намеренно: у первого поле с заливкой и подписью, у
                второго просто строка. Раньше оба были серыми
                прямоугольниками, и по номеру пробовали щёлкнуть. */}
            <div className="mt-5">
              <NameForm name={me.name} />
            </div>

            <div className="rows mt-2">
              <ValueRow label={t.profile.phone} value={formatPhone(me.phone)} mono />
            </div>
          </Panel>

          <Panel title={t.profile.security}>
            {!account.phoneVerifiedAt && (
              /* Номер без подтверждения — дыра именно в безопасности:
                 без него PIN не восстановить. Поэтому предложение стоит
                 здесь, над самим кодом, а не отдельным прибором в
                 стороне. */
              <div className="mb-5 border-b pb-5" style={{ borderColor: 'var(--hairline)' }}>
                <p className="mb-2.5 text-[14px] font-semibold">{t.auth.verifyPhone}</p>
                <VerifyPhonePanel phone={maskPhone(account.phone)} />
              </div>
            )}

            <PinCard hasPin={hasPin(account.pinHash)} />
          </Panel>
        </div>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-5">
          <SubscriptionSummary access={access} businessName={tenant.name} owner={owner} />

          {/* Язык и тема — в одном приборе и оба про «мой экран», а не
              про бизнес. Мойщик на той же мойке может записывать машины
              по-армянски, пока владелец читает отчёты по-русски. */}
          <Panel title={t.profile.interface}>
            <div className="rows">
              <LanguagePicker />
              <ThemePicker />
            </div>
          </Panel>

          <Panel title={t.profile.session}>
            <RememberLoginToggle initial={rememberLogin} />
          </Panel>

          <Panel title={t.profile.account}>
            <p className="text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
              {t.profile.signOutNote}
            </p>
            <div className="mt-3.5">
              <SignOutButton labelled />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Две буквы имени: тот же приём, что у плитки человека в списке. */
function initials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
