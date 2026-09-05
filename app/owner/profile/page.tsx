import { redirect } from 'next/navigation';

import { currentSessionId, rememberedLoginEnabled, requireSession } from '@/lib/auth';
import { ensureDb } from '@/lib/db/ready';
import { listDevices } from '@/lib/devices';
import { hhmm, ymd } from '@/lib/time';
import { intlLocale } from '@/lib/i18n/format';
import type { Dict } from '@/lib/i18n';
import { getDict } from '@/lib/i18n/server';
import { localizeTenant } from '@/lib/i18n/terms';
import { getTenant, getUser } from '@/lib/queries';
import { currentAccess } from '@/lib/subscription';
import { accountOf } from '@/lib/accounts';
import { hasPin } from '@/lib/pin';
import { LanguagePicker } from '@/components/language-picker';
import { SignOutButton } from '@/components/sign-out-button';
import { SettingList, SettingRow } from '@/components/patterns/form';
import { PageHeader } from '@/components/patterns/page-header';
import { Panel } from '@/components/patterns/panel';
import { PersonAvatar } from '@/components/patterns/person';
import { DeviceList, type DeviceRow } from './devices';
import { NameForm } from './name-form';
import { PhoneForm } from './phone-form';
import { PinCard } from './pin-card';
import { NotifyOrdersToggle, RememberLoginToggle } from './session-toggles';
import { SubNav, SubNavLayout } from './sub-nav';
import { SubscriptionSummary } from './subscription-summary';
import { ThemeSwitch } from './theme-switch';

/**
 * Мой аккаунт: личное внутри рабочего.
 *
 * Одна стопка названных панелей и оглавление слева; каждая панель
 * отвечает на свой вопрос: кто я, чем закрыт мой вход, как выглядит мой
 * экран, что помнит этот браузер, откуда ещё открыт вход, сколько
 * осталось по подписке, как отсюда выйти. Здесь нет ни таблиц, ни
 * чисел, и стопка у́же общей меры кабинета: поле ввода шириной в метр
 * читается как ошибка вёрстки.
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

  /* Слова бизнеса на языке того, кто смотрит; своё название владельца
     проходит насквозь (см. terms.ts). */
  const tenant = localizeTenant(raw, t.locale);

  /* Подтверждён ли номер: свойство человека, а не его работы на точке. */
  const account = await accountOf(me);
  const pinSet = hasPin(account.pinHash);

  const access = currentAccess(tenant);
  const owner = session.role === 'owner';

  /* Часы собираются здесь, в поясе бизнеса: пересчитанные на той
     стороне по часам смотрящего, они превратили бы вечер в утро. */
  const devices: DeviceRow[] = (await listDevices(session.uid, sid)).map((d) => ({
    id: d.id,
    kind: d.kind,
    device: d.device,
    lastSeen: whenLabel(d.lastSeenAt, tenant.timezone, t),
    current: d.current,
  }));

  const nav = [
    { id: 'personal', label: t.profile.personal },
    { id: 'security', label: t.profile.security },
    { id: 'interface', label: t.profile.interface },
    { id: 'session', label: t.profile.session },
    { id: 'devices', label: t.profile.devices },
    { id: 'access', label: owner ? t.profile.access : t.settings.business },
    { id: 'account', label: t.profile.account },
  ];

  return (
    <div className="flex flex-col gap-5">
      <PageHeader className="mb-0" title={t.profile.title} description={t.profile.lead} />

      <SubNavLayout nav={<SubNav label={t.profile.title} items={nav} />}>
        <Panel id="personal" title={t.profile.personal} className="scroll-mt-16">
          <div className="flex items-center gap-3">
            <PersonAvatar name={me.name} size="lg" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{me.name}</div>
              <div className="text-xs text-muted-foreground">
                {owner ? t.roles.owner : tenant.staffRole}
              </div>
            </div>
          </div>

          {/* Имя правится, телефон нет, и выглядят они по-разному
              намеренно: у первого поле, у второго просто строка. */}
          <div className="mt-4">
            <NameForm name={me.name} />
          </div>

          {/* Телефон здесь же, среди личных данных, а не в безопасности:
              владелец входит почтой, и номер у него связь, а не ключ.
              Подтверждать его больше нечем — кодов из SMS у продукта
              нет, — и подтверждение ему не нужно. */}
          <div className="mt-4 border-t border-border pt-4">
            <PhoneForm phone={me.phone} />
          </div>
        </Panel>

        <Panel id="security" title={t.profile.security} className="scroll-mt-16">
          <div className="flex flex-col divide-y divide-border *:py-4 *:first:pt-0 *:last:pb-0">
            <div>
              <PinCard hasPin={pinSet} />
            </div>

          </div>
        </Panel>

        {/* Язык и тема про «мой экран», а не про бизнес: мойщик может
            записывать машины по-армянски, пока владелец читает отчёты
            по-русски. */}
        <Panel id="interface" title={t.profile.interface} className="scroll-mt-16" padded={false}>
          <SettingList className="px-4">
            <SettingRow label={t.common.language} control={<LanguagePicker />} />
            <SettingRow label={t.common.theme} control={<ThemeSwitch />} />
          </SettingList>
        </Panel>

        <Panel id="session" title={t.profile.session} className="scroll-mt-16" padded={false}>
          <SettingList className="px-4">
            {/* Уведомления: настройка человека в базе, решает, придёт ли
                пуш на телефон. Мойщику не показываем: письма о записях
                уходят владельцам. */}
            {owner && <NotifyOrdersToggle initial={me.notifyOrders} />}
            <RememberLoginToggle initial={rememberLogin} />
          </SettingList>
        </Panel>

        {/* Устройства рядом с «этим устройством», а не в «безопасности»:
            там лежит то, чем закрыт вход, здесь то, где он уже открыт. */}
        <Panel
          id="devices"
          title={t.profile.devices}
          description={devices.length > 1 ? t.profile.devicesNote : undefined}
          className="scroll-mt-16"
          padded={false}
        >
          <DeviceList rows={devices} />
        </Panel>

        <SubscriptionSummary id="access" access={access} businessName={tenant.name} owner={owner} />

        <Panel id="account" title={t.profile.account} className="scroll-mt-16">
          <p className="text-sm text-muted-foreground">{t.profile.signOutNote}</p>
          <div className="mt-3">
            <SignOutButton labelled variant="outline" />
          </div>
        </Panel>
      </SubNavLayout>
    </div>
  );
}

/**
 * Когда последний раз видели этот вход.
 *
 * «Сегодня, 12:24» вместо полной даты: строка стоит под названием
 * устройства и отвечает «давно ли», а не «какого числа». Точная дата
 * появляется у всего, что старше вчера.
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
