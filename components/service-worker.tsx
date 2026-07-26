'use client';

import { useEffect } from 'react';

/** Регистрация проходит молча: пользователю про неё знать незачем. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // В разработке офлайн не нужен, а кэш живёт дольше правок:
    // отредактированные стили и код продолжали бы приходить старыми.
    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((r) => void r.unregister());
      });
      return;
    }

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // без офлайна приложение всё равно работает
    });
  }, []);

  return null;
}
