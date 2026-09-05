'use client';

import { useRef } from 'react';
import { motion, useInView, useReducedMotion } from 'motion/react';

/**
 * Робот, выглядывающий из-за нижнего края ЭКРАНА.
 *
 * Кромки в картинке нет: руки держатся за то, что нарисует не рендер, а
 * браузер. Сначала он стоял у нижней границы секции, и выходило плохо —
 * границы у секций нет вовсе, лист один на всю витрину, и держаться ему
 * было не за что. Край окна такой проблемой не страдает: он есть всегда
 * и виден всегда.
 *
 * Появляется, когда секция входит в кадр, и уезжает вниз, когда уходит.
 * Не липнет на всю страницу: мойщик, который держится за экран во время
 * чтения цены, — это уже не приём, а помеха.
 *
 * Сторону выбирает секция, и это не вкусовщина: он обязан встать там,
 * где под ним пусто, иначе накроет текст. В секции цены свободен правый
 * низ, под кнопкой.
 *
 * Указателя не ловит. Ниже планшета его нет: на телефоне он закрыл бы
 * половину экрана, и держаться там будет не за что — там читают, а не
 * рассматривают.
 */
export function Peek({ src, side = 'left' }: { src: string; side?: 'left' | 'right' }) {
  const anchor = useRef<HTMLDivElement>(null);
  /* Наблюдаем не за самим роботом (он `fixed` и всегда «в кадре»), а за
     распоркой во всю секцию. */
  const inView = useInView(anchor, { amount: 0.3 });
  const still = useReducedMotion();

  return (
    <>
      <div ref={anchor} aria-hidden className="pointer-events-none absolute inset-0" />

      <motion.img
        src={src}
        alt=""
        aria-hidden
        width={700}
        height={490}
        className={`pointer-events-none fixed bottom-0 z-30 hidden h-auto w-[180px] md:block lg:w-[240px] ${
          side === 'right' ? 'right-4 lg:right-8' : 'left-4 lg:left-8'
        }`}
        initial={{ y: '104%' }}
        animate={{ y: still || inView ? '0%' : '104%' }}
        transition={
          still ? { duration: 0 } : { type: 'spring', stiffness: 130, damping: 19, mass: 0.9 }
        }
      />
    </>
  );
}
