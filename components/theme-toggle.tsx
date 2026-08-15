'use client';

import { useEffect, useState } from 'react';
import { IconHalf, IconMoon, IconSun } from '@/components/icons';
import { useT } from '@/lib/i18n/client';

type Theme = 'light' | 'dark';

/**
 * Переключатель темы.
 *
 * Показывает ту тему, в которую переключит, а не текущую: иначе
 * приходится гадать, солнце — это «сейчас светло» или «сделать светло».
 */
export function ThemeToggle() {
  const t = useT();
  const [theme, setTheme] = useState<Theme | null>(null);

  // до монтирования тему знает только скрипт в <head>, поэтому
  // читаем её из документа, а не гадаем на сервере
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');
  }, []);

  function flip() {
    const next: Theme = theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem('bazis.theme', next);
    } catch {
      // приватный режим: тема просто не запомнится
    }
    setTheme(next);
  }

  const label = theme === 'light' ? t.common.themeDark : t.common.themeLight;

  return (
    <button className="btn-icon btn-icon-board" onClick={flip} title={label} aria-label={label}>
      {/* пока тема не прочитана, рисуем нейтральный знак — так кнопка
          не прыгает между иконками сразу после загрузки */}
      {theme === null ? (
        <IconHalf className="size-4" />
      ) : theme === 'light' ? (
        <IconMoon className="size-4" />
      ) : (
        <IconSun className="size-4" />
      )}
    </button>
  );
}
