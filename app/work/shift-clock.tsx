'use client';

import { useEffect, useState } from 'react';
import { hy } from '@/lib/i18n/hy';

/**
 * Сколько человек уже на смене.
 *
 * Час начала пишет сервер — он один и тот же в зоне мойки для всех, кто
 * на него смотрит. А вот «работаю 7 ч 15 мин» сервер написать не может:
 * страница собирается один раз, а число растёт каждую минуту, и через
 * час после загрузки оно врало бы ровно на час.
 *
 * До первой отрисовки не показываем ничего. Разметка сервера и разметка
 * браузера обязаны совпасть — а совпасть они не могут: между сборкой
 * страницы и её гидратацией проходит время, и минуты уже разные. Пустое
 * место, которое через мгновение заполняется, честнее мигающего числа.
 */
export function ShiftClock({ openedAt }: { openedAt: string }) {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    const start = new Date(openedAt).getTime();

    /* Раз в полминуты, а не раз в секунду: показываем минуты, и чаще
       обновлять нечего. Часы на мойке никто не сверяет по секундам. */
    const tick = () => {
      const minutes = Math.max(0, Math.floor((Date.now() - start) / 60_000));
      setText(hy.work.lasted(Math.floor(minutes / 60), minutes % 60));
    };

    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [openedAt]);

  if (text === null) return null;
  return <span> · {text}</span>;
}
