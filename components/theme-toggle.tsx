'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Переключатель темы.
 *
 * Показывает ту тему, в которую переключит, а не текущую: иначе
 * приходится гадать, солнце — это «сейчас светло» или «сделать светло».
 */
export function ThemeToggle() {
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

  const label = theme === 'light' ? 'Մուգ' : 'Լուսավոր';

  return (
    <button className="btn-icon" onClick={flip} title={label} aria-label={label}>
      {/* пока тема не прочитана, рисуем нейтральный знак — так кнопка
          не прыгает между иконками сразу после загрузки */}
      {theme === null ? '◐' : theme === 'light' ? '☾' : '☀'}
    </button>
  );
}
