'use client';

import { useEffect } from 'react';

/** Регистрация проходит молча: пользователю про неё знать незачем. */
export function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // без офлайна приложение всё равно работает
    });
  }, []);

  return null;
}
