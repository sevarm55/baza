'use client';

import { Segmented } from '@/components/segmented';
import { setTheme, useTheme } from '@/components/use-theme';
import { useT } from '@/lib/i18n/client';

/**
 * Тема — строкой настройки, а не значком.
 *
 * Значок в шапке телефона показывает то, КУДА переключит нажатие, и это
 * правильно для кнопки, которую жмут на бегу. В настройках интерфейса
 * нужно обратное: видеть, что стоит СЕЙЧАС, и выбрать другое. Поэтому
 * здесь тот же жёлоб с переезжающей плашкой, что у периодов и месяцев в
 * кабинете, — единственный переключатель продукта.
 *
 * Положений два, потому что тем в продукте ровно две. Третьего,
 * «системного», нет ни в вебе, ни в приложении, и рисовать его тут
 * значило бы обещать несуществующее.
 */
export function ThemePicker() {
  const t = useT();
  const theme = useTheme();

  return (
    <div className="setting-row">
      <span className="min-w-0">
        <span className="setting-row-label">{t.common.theme}</span>
      </span>
      <Segmented
        id="profile-theme"
        current={theme}
        label={t.common.theme}
        onSelect={(key) => setTheme(key === 'light' ? 'light' : 'dark')}
        items={[
          { key: 'light', label: t.common.themeLight },
          { key: 'dark', label: t.common.themeDark },
        ]}
      />
    </div>
  );
}
