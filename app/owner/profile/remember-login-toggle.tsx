'use client';

import { setRememberLogin } from '@/app/actions';
import { SettingSwitch } from '@/components/setting-switch';
import { useT } from '@/lib/i18n/client';

/** Настройка этого браузера: без перезагрузки и без хранения токена в JS. */
export function RememberLoginToggle({ initial }: { initial: boolean }) {
  const t = useT();

  return (
    <SettingSwitch
      label={t.profile.rememberLogin}
      note={t.profile.rememberLoginNote}
      initial={initial}
      onChange={setRememberLogin}
    />
  );
}
