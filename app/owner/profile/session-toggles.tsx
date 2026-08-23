'use client';

import { setNotifyOrders, setRememberLogin } from '@/app/actions';
import { useT } from '@/lib/i18n/client';
import { SettingSwitch } from './setting-switch';

/**
 * Уведомлять ли о каждой записи.
 *
 * Настройка человека, а не устройства: она в базе, и приложение читает
 * её при запуске. Выключенная здесь выключена и на телефоне. Об открытии
 * смены сообщаем всегда, и пояснение говорит об этом прямо.
 */
export function NotifyOrdersToggle({ initial }: { initial: boolean }) {
  const t = useT();

  return (
    <SettingSwitch
      id="profile-notify-orders"
      label={t.profile.notifyOrders}
      description={t.profile.notifyOrdersNote}
      initial={initial}
      onChange={setNotifyOrders}
    />
  );
}

/** Настройка этого браузера: без перезагрузки и без хранения токена в JS. */
export function RememberLoginToggle({ initial }: { initial: boolean }) {
  const t = useT();

  return (
    <SettingSwitch
      id="profile-remember-login"
      label={t.profile.rememberLogin}
      description={t.profile.rememberLoginNote}
      initial={initial}
      onChange={setRememberLogin}
    />
  );
}
