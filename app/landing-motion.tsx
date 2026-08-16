'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Единственное движение шапки витрины: линия под ней.
 *
 * У самого верха страницы разделительная линия делит пустоту — над ней
 * ничего нет. Она нужна ровно тогда, когда под шапку что-то уехало: без
 * неё содержимое, проходящее под полупрозрачной шапкой, читается как
 * наложенное поверх неё.
 *
 * Наблюдатель, а не обработчик прокрутки: обработчик срабатывает на
 * каждый пиксель и заставляет браузер считать разметку в такт пальцу,
 * а здесь нужно одно логическое событие — «верх страницы ушёл».
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА, доставшееся от прежней витрины: спрятанное
 * состояние существует только тогда, когда есть кому его показать. Здесь
 * сервер рисует обычную шапку без линии, и это верно и без JavaScript —
 * у поискового робота, при заблокированных скриптах и при отключённом
 * движении страница остаётся полностью читаемой.
 */
export function NavShadow({
  className,
  children,
}: {
  className: string;
  children: React.ReactNode;
}) {
  const [stuck, setStuck] = useState(false);
  const mark = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = mark.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      {/* Метка нулевой высоты в самом верху документа. Следить за самой
          шапкой нельзя: она липкая и из области видимости не уходит
          никогда. */}
      <div ref={mark} aria-hidden style={{ height: 0 }} />
      <header className={className} data-stuck={stuck ? '' : undefined}>
        {children}
      </header>
    </>
  );
}
