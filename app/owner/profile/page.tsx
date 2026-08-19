import { redirect } from 'next/navigation';
import { currentSessionId, rememberedLoginEnabled, requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { listDevices } from '@/lib/devices';
import { hhmm, ymd } from '@/lib/time';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import { getTenant, getUser } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { formatPhone, maskPhone } from '@/lib/phone';
import { Panel } from '@/components/board';
import { PageHead } from '@/components/page-head';
import { SignOutButton } from '@/components/sign-out-button';
import { ValueRow } from '@/components/value-row';
import { accountOf } from '@/lib/accounts';
import { hasPin } from '@/lib/pin';
import { ChangePhonePanel } from './change-phone-panel';
import { ProfileFace } from './face';
import { DeviceList, type DeviceRow } from './devices';
import { NameForm } from './name-form';
import { NotifyOrdersToggle } from './notify-orders-toggle';
import { PinCard } from './pin-card';
import { SubscriptionSummary } from './subscription-summary';
import { ThemePicker } from './theme-picker';
import { VerifyPhonePanel } from './verify-phone-panel';
import { RememberLoginToggle } from './remember-login-toggle';
import { ResumeSetup } from './resume-setup';
import { getSetup } from '@/lib/onboarding';
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

  const [raw, me, rememberLogin, sid] = await Promise.all([
    getTenant(session.tid),
    getUser(session.tid, session.uid),
    rememberedLoginEnabled(),
    currentSessionId(),
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

  /* Предложение вернуть настройку — только тому, кто её убрал, и только
     пока в ней есть смысл. Считается тем же кодом, что и сам блок, но с
     оглядкой на «как если бы не убирали»: у мойки, которая работает
     третий месяц, возвращать нечего (см. lib/onboarding.ts). */
  const setup = owner ? await getSetup(raw, me, { ignoreHidden: true }) : null;
  const canResume = owner && me.setupHiddenAt !== null && setup !== null && setup.visible;

  /* Часы собираются здесь, в поясе бизнеса: `Date` через границу
     сервер-клиент проходит, но пересчитан на той стороне будет по
     часам смотрящего, и вход из вечера превратится в утро. */
  const devices: DeviceRow[] = (await listDevices(session.uid, sid)).map((d) => ({
    id: d.id,
    kind: d.kind,
    device: d.device,
    lastSeen: whenLabel(d.lastSeenAt, tenant.timezone, t),
    current: d.current,
  }));

  return (
    <div className="page-narrow">
      <PageHead title={t.profile.title} meta={t.profile.lead} />

      <div className="grid gap-[var(--seam)] lg:grid-cols-12">
        <div className="grid content-start gap-[var(--seam)] lg:col-span-7">
          <Panel title={t.profile.personal}>
            {/* Кто вошёл. Фото, а не две буквы: см. face.tsx. */}
            <ProfileFace name={me.name} role={owner ? t.roles.owner : tenant.staffRole} />

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

            {/* Номер — здесь же, под кодом: это второй ключ от входа, а
                не строка личных данных. Выше, в «личных данных», он
                показан просто как значение — там на него отвечают на
                вопрос «как со мной связаться». */}
            <div className="mt-5 border-t pt-5" style={{ borderColor: 'var(--hairline)' }}>
              <ChangePhonePanel hasPin={hasPin(account.pinHash)} />
            </div>
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

          {canResume && (
            <Panel title={t.setup.resume}>
              <p className="text-[13.5px]" style={{ color: 'var(--board-muted)' }}>
                {t.setup.resumeNote}
              </p>
              <div className="mt-3.5">
                <ResumeSetup />
              </div>
            </Panel>
          )}

          <Panel title={t.profile.session}>
            <div className="grid gap-2">
              {/* Уведомления — настройка человека, а не браузера: она в
                  базе и решает, придёт ли пуш на телефон. Владелец,
                  сидящий за компьютером, выключает их отсюда, а не идёт
                  за телефоном. Мойщику не показываем: письма о записях
                  уходят владельцам, и ему этот выключатель не отвечает
                  ни на что. */}
              {owner && <NotifyOrdersToggle initial={me.notifyOrders} />}
              <RememberLoginToggle initial={rememberLogin} />
            </div>
          </Panel>

          {/* Устройства — рядом с «этим устройством», а не в
              «безопасности»: там лежит то, чем закрыт вход, а здесь то,
              где он уже открыт. Вопросы разные, и решения по ним разные. */}
          <Panel title={t.profile.devices}>
            <DeviceList rows={devices} />
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

/**
 * Когда последний раз видели этот вход.
 *
 * «Сегодня, 12:24» вместо «17 августа 2026, 12:24»: строка стоит под
 * названием устройства и отвечает на вопрос «давно ли», а не «какого
 * числа». Точная дата нужна только у входа, которого человек не узнаёт,
 * и там она как раз и появляется — у всего, что старше вчера.
 */
function whenLabel(at: Date, timezone: string, t: Dict): string {
  const day = ymd(at, timezone);
  const time = hhmm(at, timezone);

  if (day === ymd(new Date(), timezone)) return `${t.common.today}, ${time}`;
  if (day === ymd(new Date(Date.now() - 86_400_000), timezone)) {
    return `${t.common.yesterday}, ${time}`;
  }

  const date = new Intl.DateTimeFormat(intlLocale(t.locale), {
    day: 'numeric',
    month: 'long',
    timeZone: timezone,
  }).format(at);
  return `${date}, ${time}`;
}

