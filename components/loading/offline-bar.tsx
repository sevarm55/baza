'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

import { useT } from '@/lib/i18n/client';

/**
 * Полоса «нет связи» на нижней кромке. Не заслонка: всё, что уже
 * приехало на экран, без связи остаётся верным и читаемым. Полоса
 * только называет причину, по которой новое не приезжает.
 */
export function OfflineBar() {
  const t = useT();
  const [off, setOff] = useState(false);

  useEffect(() => {
    const sync = () => setOff(navigator.onLine === false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  if (!off) return null;

  return (
    <div
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 flex items-center justify-center gap-2 border-t border-warning/30 bg-warning-soft px-4 py-2 text-sm font-medium text-warning-soft-foreground"
      role="status"
      aria-live="polite"
    >
      <WifiOff className="size-4" aria-hidden />
      {t.common.offline}
    </div>
  );
}
