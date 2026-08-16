import { redirect } from 'next/navigation';
import { rememberedLoginEnabled, requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { formatPhone, maskPhone } from '@/lib/phone';
import { personColor } from '@/lib/person-color';
import { hy } from '@/lib/i18n/hy';
import { Panel, Tile } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { SignOutButton } from '@/components/sign-out-button';
import { currentAuthLocale } from '@/lib/i18n/server';
import { authDict } from '@/lib/i18n/auth';
import { accountOf } from '@/lib/accounts';
import { ChangePinForm } from './change-pin-form';
import { VerifyPhonePanel } from './verify-phone-panel';
import { RememberLoginToggle } from './remember-login-toggle';

/**
 * Профиль — то же, что на телефоне.
 *
 * Появился по той же причине, что и в приложении: настройки делали две
 * несовместимые работы. Цены и сотрудники — это то, куда ходят работать;
 * свой PIN, своё имя и срок подписки — то, что трогают раз в год. Десять
 * пунктов вперемешку читаются плохо.
 *
 * И потому, что смены PIN в вебе не было вовсе: механизм есть с самого
 * начала (`lib/profile`), а дотянуться до него из браузера было нельзя.
 * PIN диктуют работнику вслух, работника однажды увольняют — и закрыть
 * доступ владельцу было нечем, кроме телефона.
 */
export default async function ProfilePage() {
  const session = await requireSession();
  await ensureDb();

  const [tenant, me, rememberLogin, locale] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
    rememberedLoginEnabled(),
    currentAuthLocale(),
  ]);
  if (!tenant || !me) redirect('/session-ended');

  /* Подтверждён ли номер — свойство человека, а не его работы на точке.
     Панель показывается только тем, у кого он не подтверждён: остальным
     она была бы напоминанием о деле, которое уже сделано. */
  const account = await accountOf(me);
  const dict = authDict(locale);

  const access = currentAccess(tenant);
  const owner = session.role === 'owner';

  return (
    <>
      <PageHead title={hy.profile.title} standalone />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-7">
          {/* Карточка человека: кто вошёл и чем он тут занимается.
              Цвет точки — тот же, которым этот человек помечен в ленте
              и на смене. */}
          <Panel>
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
                <div className="num truncate text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                  {formatPhone(me.phone)} · {owner ? hy.roles.owner : tenant.staffRole}
                </div>
              </div>
            </div>
          </Panel>

          {!account.phoneVerifiedAt && (
            <Panel title={dict.security.verifyPhone}>
              <VerifyPhonePanel locale={locale} phone={maskPhone(account.phone)} />
            </Panel>
          )}

          <Panel title={hy.auth.changePin}>
            <ChangePinForm locale={locale} />
          </Panel>
        </div>

        <div className="grid content-start gap-[var(--seam)] lg:col-span-5">
          {/* Срок — плиткой, как в приложении: это показание, а не
              строка настроек. Владельцу видно, сколько осталось;
              работнику про оплату знать незачем, у него плитка бизнеса. */}
          {/* Без `wide`. Этот столбец — не сетка плиток, а стопка в одну
              колонку, и `col-span-2` создавал в ней вторую колонку из
              воздуха: плитка растягивалась на обе, а панель «Այս սարքը»
              под ней оставалась в первой и была на треть уже соседей. */}
          {owner ? (
            <Tile
              tone={access.warn ? 'amber' : 'teal'}
              label={hy.profile.access}
              value={
                access.state === 'trial'
                  ? hy.billing.trialLeft(access.daysLeft)
                  : access.state === 'active'
                    ? hy.billing.paidLeft(access.daysLeft)
                    : hy.billing.expiredTitle
              }
              note={tenant.name}
            />
          ) : (
            <Tile tone="slate" label={hy.settings.business} value={tenant.name} />
          )}

          <Panel title={hy.profile.session}>
            <RememberLoginToggle initial={rememberLogin} />
            <p className="note !mt-3 !border-0 !pt-0">{hy.profile.signOutNote}</p>
            <div className="mt-3 flex items-center gap-2.5">
              <SignOutButton />
              <span className="text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {hy.auth.signOut}
              </span>
            </div>
          </Panel>
        </div>
      </div>
    </>
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
