import { redirect } from 'next/navigation';
import { rememberedLoginEnabled, requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { getTenant, getUser } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { formatPhone } from '@/lib/phone';
import { personColor } from '@/lib/person-color';
import { Panel, Tile } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { SignOutButton } from '@/components/sign-out-button';
import { ChangePinForm } from './change-pin-form';
import { RememberLoginToggle } from './remember-login-toggle';
import { getDict } from '@/lib/i18n/server';
import { LanguagePicker } from '@/components/language-picker';
import { localizeTenant } from '@/lib/i18n/terms';

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

  const access = currentAccess(tenant);
  const owner = session.role === 'owner';

  return (
    <>
      <PageHead title={t.profile.title} standalone />

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
                  {formatPhone(me.phone)} · {owner ? t.roles.owner : tenant.staffRole}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title={t.auth.changePin}>
            <ChangePinForm />
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
              label={t.profile.access}
              value={
                access.state === 'trial'
                  ? t.billing.trialLeft(access.daysLeft)
                  : access.state === 'active'
                    ? t.billing.paidLeft(access.daysLeft)
                    : t.billing.expiredTitle
              }
              note={tenant.name}
            />
          ) : (
            <Tile tone="slate" label={t.settings.business} value={tenant.name} />
          )}

          {/* Язык стоит внутри «этого устройства», а не отдельной
              панелью с тем же словом в заголовке: язык выбирает человек
              для себя и на своём экране, а не владелец для всей мойки.
              Мойщик на той же мойке может записывать машины
              по-армянски, пока владелец читает отчёты по-русски. */}
          <Panel title={t.profile.session}>
            <LanguagePicker />
            <RememberLoginToggle initial={rememberLogin} />
            <p className="note !mt-3 !border-0 !pt-0">{t.profile.signOutNote}</p>
            <div className="mt-3 flex items-center gap-2.5">
              <SignOutButton />
              <span className="text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {t.auth.signOut}
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
