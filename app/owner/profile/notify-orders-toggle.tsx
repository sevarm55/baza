'use client';

import { setNotifyOrders } from '@/app/actions';
import { SettingSwitch } from '@/components/setting-switch';
import { useT } from '@/lib/i18n/client';

/**
 * Уведомлять ли о каждой записи.
 *
 * Настройка человека, а не устройства: она в базе, и приложение читает
 * её при запуске. Выключенная здесь — выключена и на телефоне.
 *
 * Об открытии смены сообщаем всегда, и об этом сказано прямо: смен две в
 * день, а машин сорок, и человек, выключающий шум, должен знать, что
 * редкое событие он не теряет. Иначе выключают уведомления целиком в
 * настройках телефона — оттуда мы их уже не вернём.
 */
export function NotifyOrdersToggle({ initial }: { initial: boolean }) {
  const t = useT();

  return (
    <SettingSwitch
      label={t.profile.notifyOrders}
      note={t.profile.notifyOrdersNote}
      initial={initial}
      onChange={setNotifyOrders}
    />
  );
}
