'use client';

import { motion, useReducedMotion } from 'motion/react';

import { AuthTrigger } from '@/components/auth-buttons';

/**
 * Дверь в шапке витрины.
 *
 * Вернувшийся клиент до сих пор попадал внутрь только адресом или с
 * самого низа страницы: единственная кнопка витрины звала регистрироваться,
 * а входить было нечем.
 *
 * Кнопка тихая. Заливки у неё нет, только волосяная рамка: на первом
 * экране уже горит свет, а внизу страницы стоит настоящий призыв, и
 * третий громкий предмет здесь был бы спором за внимание. Шапка обязана
 * пропускать взгляд к заголовку.
 *
 * Живёт она наведением. Под курсором тёплая плашка наезжает СПРАВА и
 * закрывает подпись, а стрелка уходит вперёд. Сторона выбрана не на
 * вкус: ровно оттуда, справа, через мгновение выедет лист входа
 * (`components/auth-dialog.tsx`). Движение кнопки — это обещание того
 * движения, которое сейчас произойдёт.
 *
 * Сделано подрезкой (`clip-path`), а не масштабом: у масштаба вместе с
 * плашкой поехала бы и подпись внутри неё. Подписи две, одна под другой,
 * и цвет меняется ровно в тот кадр, когда край плашки проходит по букве,
 * а не заранее по общему `transition`.
 *
 * Магнитного притяжения тут нет и не будет. Приём уводит кнопку из-под
 * указателя между нажатием и отпусканием, браузер видит два разных
 * элемента и клика не засчитывает; та же причина записана у кнопки
 * внизу страницы (`components/landing/cta.tsx`).
 */

/** Стрелка. Тонкая, в одну линию — как и все прочие знаки шапки. */
function Arrow() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-[13px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M2.5 8h11M9.5 4l4 4-4 4" />
    </svg>
  );
}

export function Enter({ label }: { label: string }) {
  const still = useReducedMotion();

  return (
    <motion.div className="inline-flex" initial="rest" whileHover="on" whileFocus="on" animate="rest">
      <AuthTrigger
        mode="signIn"
        className={[
          'group relative inline-flex h-9 items-center overflow-hidden rounded-xl px-3.5 md:h-10 md:px-4',
          'border border-[#1a120e]/25 dark:border-white/25',
          'text-[13px] font-medium tracking-[-0.01em] md:text-sm',
          'transition-colors duration-200 hover:border-transparent dark:hover:border-transparent',
          'outline-none focus-visible:ring-3 focus-visible:ring-[#c0390f]/40 dark:focus-visible:ring-[#ff6a2a]/40',
        ].join(' ')}
      >
        {/* Нижняя подпись: та, что видна в покое. */}
        <span className="inline-flex items-center gap-2 text-[#1a120e] dark:text-white">
          {label}
          <motion.span
            className="inline-flex"
            variants={still ? undefined : { rest: { x: 0 }, on: { x: 3 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          >
            <Arrow />
          </motion.span>
        </span>

        {/* Верхняя подпись: лежит на плашке и появляется вместе с ней. */}
        <motion.span
          aria-hidden
          className="absolute inset-0 flex items-center gap-2 bg-[#c0390f] px-3.5 text-[#fffde3] md:px-4 dark:bg-[#ff6a2a] dark:text-[#10100e]"
          initial={false}
          variants={
            still
              ? undefined
              : {
                  rest: { clipPath: 'inset(0 0 0 100%)' },
                  on: { clipPath: 'inset(0 0 0 0%)' },
                }
          }
          transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        >
          {label}
          <motion.span
            className="inline-flex"
            variants={still ? undefined : { rest: { x: 0 }, on: { x: 3 } }}
            transition={{ type: 'spring', stiffness: 400, damping: 26 }}
          >
            <Arrow />
          </motion.span>
        </motion.span>
      </AuthTrigger>
    </motion.div>
  );
}
