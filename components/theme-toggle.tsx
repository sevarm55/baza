'use client';

import { Moon, Sun } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { setTheme, useTheme } from '@/components/use-theme';
import { useT } from '@/lib/i18n/client';

/**
 * Переключатель темы в шапке витрины.
 *
 * Показывает ту тему, в которую переключит, а не текущую: иначе
 * приходится гадать, солнце это «сейчас светло» или «сделать светло».
 * Тему берёт из общего хранилища (`use-theme`), поэтому совпадает с
 * остальными переключателями продукта.
 */
export function ThemeToggle() {
  const t = useT();
  const theme = useTheme();
  const label = theme === 'light' ? t.common.themeDark : t.common.themeLight;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      title={label}
      aria-label={label}
    >
      {theme === 'light' ? <Moon aria-hidden /> : <Sun aria-hidden />}
    </Button>
  );
}
