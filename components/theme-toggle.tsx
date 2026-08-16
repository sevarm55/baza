'use client';

import { IconMoon, IconSun } from '@/components/icons';
import { setTheme, useTheme } from '@/components/use-theme';
import { useT } from '@/lib/i18n/client';

/**
 * Переключатель темы в шапке телефона.
 *
 * Показывает ту тему, в которую переключит, а не текущую: иначе
 * приходится гадать, солнце — это «сейчас светло» или «сделать светло».
 *
 * Тему берёт из общего хранилища (`use-theme`), а не из своего
 * состояния. Раньше здесь был `useState` плюс эффект, читающий документ
 * после монтирования: значок жил своей жизнью и оставался прежним, когда
 * тему меняли из меню пользователя. Заодно исчез третий, «неизвестный»
 * знак — до первой отрисовки тему теперь знает и сервер, и клиент.
 */
export function ThemeToggle() {
  const t = useT();
  const theme = useTheme();
  const label = theme === 'light' ? t.common.themeDark : t.common.themeLight;

  return (
    <button
      className="btn-icon btn-icon-board"
      onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
      title={label}
      aria-label={label}
    >
      {theme === 'light' ? <IconMoon className="size-4" /> : <IconSun className="size-4" />}
    </button>
  );
}
