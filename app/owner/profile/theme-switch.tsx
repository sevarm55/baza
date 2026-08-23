'use client';

import { Segmented } from '@/components/patterns/segmented';
import { setTheme, useTheme } from '@/components/use-theme';
import { useT } from '@/lib/i18n/client';

/**
 * Тема: видно, что стоит сейчас, и выбирается другое.
 *
 * Положений два, потому что тем в продукте ровно две. «Системной» нет
 * ни в вебе, ни в приложении, и рисовать её здесь значило бы обещать
 * несуществующее.
 */
export function ThemeSwitch() {
  const t = useT();
  const theme = useTheme();

  return (
    <Segmented
      size="sm"
      current={theme}
      label={t.common.theme}
      onSelect={(key) => setTheme(key === 'dark' ? 'dark' : 'light')}
      items={[
        { key: 'light', label: t.common.themeLight },
        { key: 'dark', label: t.common.themeDark },
      ]}
    />
  );
}
