'use client';

import { useSyncExternalStore } from 'react';
import { motion } from 'motion/react';

/**
 * Появление блоков витрины при прокрутке.
 *
 * Витрину листают, а не читают, и без движения все экраны одинаковы по
 * весу: глаз не понимает, что начался новый. Карточка, которая въезжает
 * снизу, отмечает границу — читатель успевает переключиться прежде, чем
 * начал разбирать кадр.
 *
 * ГЛАВНОЕ ПРАВИЛО ЭТОГО ФАЙЛА: спрятанное состояние существует только
 * тогда, когда есть кому его показать. Первая версия отдавала с сервера
 * `opacity: 0` во встроенном стиле, и без JavaScript — у поискового
 * робота, при заблокированных скриптах, при `prefers-reduced-motion` —
 * витрина оставалась пустым белым листом. Проверено в браузере: все
 * блоки читались как `opacity: 0` и такими и оставались.
 *
 * Поэтому сервер рисует обычный узел, без прозрачности и сдвига, а на
 * движковый переключаются уже в браузере — в `useLayoutEffect`, то есть
 * до первой отрисовки, так что подмены не видно. Если движение
 * отключено системно, переключения не происходит вовсе: блок просто
 * стоит на месте. Это не украшение — у части людей движение вызывает
 * головокружение и тошноту, и системный переключатель их ответ на это.
 */

/* Кривая та же, что у переездов в приложении: быстрый старт, длинное
   мягкое торможение. Ощущается как «доехало», а не «остановилось». */
const EASE = [0.22, 1, 0.36, 1] as const;

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** В браузере анимируем, только если человек этого не запретил. */
const inBrowser = () => !window.matchMedia(QUERY).matches;

/** На сервере не анимируем никогда — там некому и нечем. */
const onServer = () => false;

/**
 * `false`, пока страница не в браузере или пока движение запрещено.
 *
 * `useSyncExternalStore`, а не состояние с эффектом: системная настройка
 * — внешнее хранилище, у неё есть отдельное серверное значение и она
 * может перещёлкнуться прямо во время просмотра. Хук читает её до первой
 * отрисовки, поэтому подмены обычного узла на движковый не видно.
 */
function useAnimated() {
  return useSyncExternalStore(subscribe, inBrowser, onServer);
}

export function Reveal({
  children,
  className,
  delay = 0,
  /** Первый экран показывается сразу: ждать прокрутки там нечего. */
  onMount = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  onMount?: boolean;
}) {
  const animated = useAnimated();
  if (!animated) return <div className={className}>{children}</div>;

  const shown = { opacity: 1, y: 0 };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 26 }}
      {...(onMount
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, amount: 0.2 } })}
      transition={{ duration: 0.75, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/**
 * То же для кадров, но вместо сдвига — едва заметный наезд.
 *
 * Снимок, приезжающий снизу вместе с текстом, читается как ещё один
 * абзац. Кадр должен вести себя как кадр: проявиться и успокоиться в
 * масштабе, оставшись на своём месте.
 */
export function RevealMedia({
  children,
  className,
  delay = 0,
  onMount = false,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  onMount?: boolean;
}) {
  const animated = useAnimated();
  if (!animated) return <div className={className}>{children}</div>;

  const shown = { opacity: 1, scale: 1 };

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, scale: 1.05 }}
      {...(onMount
        ? { animate: shown }
        : { whileInView: shown, viewport: { once: true, amount: 0.15 } })}
      transition={{ duration: 0.9, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}
