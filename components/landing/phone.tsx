'use client';

import Image from 'next/image';
import { motion, useMotionValue, useReducedMotion, useSpring, useTransform } from 'motion/react';

/**
 * Телефон с настоящим экраном приложения.
 *
 * Корпус нарисован, экран — нет. Внутри снимок текущей сборки, снятый с
 * симулятора (`public/app/summary-*.webp`), с теми же числами, что в
 * кабинете двумя секциями выше: мойка одна и та же. Рисовать интерфейс
 * внутри рамки было бы возвращением к тому, от чего мы ушли, — витрина
 * показывает продукт, а не его изображение.
 *
 * Островок камеры не нарисован: он уже есть в снимке. Второй, поверх,
 * дал бы два выреза один в другом.
 *
 * Корпус собран тенями, а не рамками: две внутренние обводки дают
 * металлический кант и чёрное поле вокруг стекла, внешняя тень сажает
 * предмет на плоскость. Кнопки — четыре полоски по бокам, с бликом
 * слева и провалом справа.
 *
 * Наклон идёт за курсором и считается вне цикла отрисовки React:
 * `useMotionValue` и пружина, ни одного `setState` на движение мыши.
 * На касании и при «уменьшении движения» наклона нет вовсе: там нет
 * курсора, а есть палец, и предмет, уезжающий под пальцем, читается
 * поломкой.
 */

/** Пропорция снимка. Совпадает с экраном iPhone 17 Pro Max. */
const W = 660;
const H = 1434;

const SPRING = { stiffness: 110, damping: 18, mass: 0.7 };

export function Phone({ src, alt }: { src: string; alt: string }) {
  const still = useReducedMotion();

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const rotY = useSpring(useTransform(px, [-0.5, 0.5], [-11, 11]), SPRING);
  const rotX = useSpring(useTransform(py, [-0.5, 0.5], [9, -9]), SPRING);

  return (
    <motion.div
      className="relative [perspective:1200px]"
      onPointerMove={(e) => {
        if (still || e.pointerType !== 'mouse') return;
        const r = e.currentTarget.getBoundingClientRect();
        px.set((e.clientX - r.left) / r.width - 0.5);
        py.set((e.clientY - r.top) / r.height - 0.5);
      }}
      onPointerLeave={() => {
        px.set(0);
        py.set(0);
      }}
      initial={still ? false : { opacity: 0, y: 60, rotateX: 18, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, rotateX: 0, scale: 1 }}
      viewport={{ once: true, margin: '-12% 0px -12% 0px' }}
      transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
    >
      <motion.div
        style={still ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: 'preserve-3d' }}
        className="relative w-[228px] sm:w-[252px] lg:w-[268px]"
      >
        {/* Корпус. Первая внутренняя обводка — металлический кант, вторая
            — чёрное поле вокруг стекла. */}
        <div
          className="relative rounded-[2.6rem] bg-[#111] p-[7px] sm:rounded-[2.9rem]"
          style={{
            boxShadow:
              'inset 0 0 0 2px #52525b, inset 0 0 0 7px #000, 0 44px 80px -20px rgba(0,0,0,0.7), 0 16px 28px -8px rgba(0,0,0,0.5)',
          }}
        >
          {/* Кнопки: тише слева, громче и блокировка справа. */}
          {[
            { top: '17%', h: '4%', side: 'left' },
            { top: '23%', h: '7%', side: 'left' },
            { top: '32%', h: '7%', side: 'left' },
            { top: '25%', h: '11%', side: 'right' },
          ].map((b, i) => (
            <span
              key={i}
              aria-hidden
              className={`absolute w-[3px] ${b.side === 'left' ? '-left-[3px] rounded-l' : '-right-[3px] rounded-r'}`}
              style={{
                top: b.top,
                height: b.h,
                background: 'linear-gradient(90deg,#404040,#171717)',
                boxShadow: 'inset -1px 0 1px rgba(255,255,255,0.15), inset 1px 0 2px rgba(0,0,0,0.8)',
              }}
            />
          ))}

          <div className="relative overflow-hidden rounded-[2.1rem] bg-black sm:rounded-[2.4rem]">
            <Image src={src} alt={alt} width={W} height={H} className="block h-auto w-full" />

            {/* Блик по стеклу. Один, наискось, слабый: сильный превращает
                снимок в картинку под плёнкой. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'linear-gradient(110deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 42%)',
              }}
            />
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
