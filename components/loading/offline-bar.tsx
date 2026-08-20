'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

import { useT } from '@/lib/i18n/client';

/**
 * Полоса «нет связи» на нижней кромке.
 *
 * Без неё пропавший интернет выглядел как сломанный продукт: кнопка
 * жалась, ничего не происходило, ошибка приходила через тридцать секунд
 * таймаута и говорила «что-то пошло не так». Мойка часто в подвале или
 * за городом, и связь там пропадает не в виде исключения.
 *
 * Не заслонка. Всё, что уже приехало на экран, без связи остаётся
 * верным и читаемым, и отбирать его незачем: владелец, стоящий в
 * подвале, всё ещё может посмотреть выручку за сегодня. Полоса только
 * называет причину, по которой новое не приезжает.
 *
 * Признак берётся у браузера и подтверждается событиями. `navigator.onLine`
 * врёт в одну сторону: «онлайн» у него значит «есть сетевой интерфейс»,
 * а не «есть интернет». Поэтому полоса показывается по `offline` —
 * ответу, в котором браузер не ошибается, — и снимается по `online`.
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
    <div className="offline-bar" role="status" aria-live="polite">
      <WifiOff className="size-4" aria-hidden />
      {t.common.offline}
    </div>
  );
}
