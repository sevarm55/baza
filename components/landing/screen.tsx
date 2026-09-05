'use client';

import { motion, useReducedMotion } from 'motion/react';

/**
 * Оправа для снимка продукта: свет за ним и его появление.
 *
 * Свет тот же, что горит в первом экране, и приходит он сверху — из-за
 * верхнего края снимка. Смысл не в украшении: кабинет это белое окно, и
 * на тёмном листе витрины оно висит вырезанным прямоугольником. Тёплое
 * зарево привязывает его к странице и повторяет composition первого
 * экрана, где свет тоже льётся сверху справа.
 *
 * Само зарево лежит ПОД снимком и потому видно только вокруг него:
 * снимок непрозрачен. Отсюда и размеры — оно шире кадра и поднято над
 * ним, иначе не было бы видно вовсе.
 *
 * Появление: кадр поднимается из размытия, свет разгорается следом.
 * Порядок важен — сначала предмет, потом свет вокруг него, иначе
 * зарево выглядит вспышкой без причины.
 */

const EASE = [0.16, 1, 0.3, 1] as const;

export function Screen({ children }: { children: React.ReactNode }) {
  const still = useReducedMotion();

  return (
    <div className="relative">
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 h-[300px] w-[118%] -translate-x-1/2 rounded-[50%] blur-[70px] md:-top-40 md:h-[460px] md:blur-[110px]"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(255,74,0,0.34), rgba(255,74,0,0) 70%)',
        }}
        initial={still ? false : { opacity: 0, scale: 0.86 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 1.1, delay: 0.18, ease: EASE }}
      />

      <motion.div
        className="relative"
        initial={still ? false : { opacity: 0, y: 38, scale: 0.985, filter: 'blur(14px)' }}
        whileInView={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
        viewport={{ once: true, margin: '0px 0px -10% 0px' }}
        transition={{ duration: 0.95, ease: EASE }}
      >
        {children}
      </motion.div>
    </div>
  );
}
