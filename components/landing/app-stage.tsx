'use client';

import { motion, useReducedMotion, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef } from 'react';

/**
 * Кинематографическая раскадровка секции про приложение.
 *
 * Приём взят из чужого примера, но переложен целиком. Там он собран на
 * GSAP со `ScrollTrigger` и `pin`; здесь — на `useScroll` из `motion`,
 * который уже держит всю витрину. Второй движок анимации ради одной
 * секции не нужен, а смешивать их в одном дереве нельзя вовсе.
 * Прикалывания к экрану тоже нет: липкая коробка внутри высокой дорожки
 * даёт тот же результат средствами раскладки, без перехвата прокрутки.
 *
 * ТРИ АКТА, как в оригинале.
 *
 *   1. Сбор.    Кадр поднимается и расходится во весь экран. Из наклона
 *               прилетает телефон, следом выскакивают плашки, слева
 *               выезжает текст, справа встаёт имя марки.
 *   2. Уход.    Всё, что собралось, гаснет и слегка отъезжает назад.
 *               Кадр остаётся пустым.
 *   3. Финал.   За кадром открывается последний экран — призыв и знак
 *               магазина, — а сам кадр собирается обратно и уходит
 *               вверх, освобождая его.
 *
 * Финальный экран лежит ПОД кадром, а не внутри: именно поэтому он и
 * открывается, когда кадр уменьшается и улетает. Внутри он уехал бы
 * вместе с ним, и третьего акта не было бы вовсе.
 *
 * Дорожка ДВЕ высоты экрана. В примере, откуда взят приём, семь тысяч
 * точек, но там он герой целой страницы и ему отдана вся прокрутка. У
 * нас секций восемь, и приложение среди них не главное: человек, уже
 * решивший и идущий к цене, упирался в четыре экрана раскадровки, через
 * которые надо прокрутить. Два — ровно столько, чтобы все три акта
 * успели прочитаться, и не больше. Число одно и меняется в одном месте.
 *
 * Прогресс сглажен пружиной: без неё раскадровка идёт рывками ровно на
 * столько, на сколько дёргается колесо мыши.
 *
 * При «уменьшении движения» ничего этого нет: дорожка схлопывается,
 * кадр стоит в обычном виде, и секция читается как любая другая.
 */

const C = { clamp: true } as const;

export function AppStage({
  lead,
  brand,
  phone,
  badges,
  cta,
}: {
  lead: React.ReactNode;
  brand: React.ReactNode;
  phone: React.ReactNode;
  badges: React.ReactNode;
  cta: React.ReactNode;
}) {
  const still = useReducedMotion();
  const track = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.4 });

  /* Кадр: расходится, держится, собирается обратно и уходит вверх. */
  const cardW = useTransform(p, [0, 0.2, 0.8, 0.9], ['88%', '100%', '100%', '86%'], C);
  const cardH = useTransform(p, [0, 0.2, 0.8, 0.9], ['74svh', '100svh', '100svh', '72svh'], C);
  const cardR = useTransform(p, [0, 0.2, 0.8, 0.9], [26, 0, 0, 30], C);
  const cardY = useTransform(p, [0, 0.2, 0.9, 1], ['20vh', '0vh', '0vh', '-130vh'], C);

  /* Телефон: прилетает из наклона, в конце первого акта уходит назад. */
  const phY = useTransform(p, [0.1, 0.36, 0.62, 0.72], [240, 0, 0, -40], C);
  const phRot = useTransform(p, [0.1, 0.36], [46, 0], C);
  const phScale = useTransform(p, [0.1, 0.36, 0.62, 0.72], [0.62, 1, 1, 0.9], C);
  const phOp = useTransform(p, [0.1, 0.28, 0.62, 0.72], [0, 1, 1, 0], C);

  /* Текст и имя марки — следом за предметом, гаснут вместе с ним. */
  const leadX = useTransform(p, [0.28, 0.44], [-60, 0], C);
  const leadOp = useTransform(p, [0.28, 0.44, 0.6, 0.7], [0, 1, 1, 0], C);
  const brandX = useTransform(p, [0.3, 0.46], [60, 0], C);
  const brandOp = useTransform(p, [0.3, 0.46, 0.6, 0.7], [0, 1, 1, 0], C);
  const badgeS = useTransform(p, [0.36, 0.5], [0.7, 1], C);
  const badgeOp = useTransform(p, [0.36, 0.5, 0.6, 0.7], [0, 1, 1, 0], C);

  /* Финал: открывается, пока кадр собирается и уходит. */
  const ctaOp = useTransform(p, [0.74, 0.88], [0, 1], C);
  const ctaS = useTransform(p, [0.74, 0.88], [0.86, 1], C);

  if (still) {
    return (
      <div className="mx-auto w-full max-w-[1360px] px-5 py-20 md:px-10 md:py-28">
        <div className="relative overflow-hidden rounded-[26px] border border-border bg-[#ffffff]/55 px-6 py-12 md:px-14 md:py-16 dark:bg-white/[0.035]">
          <Glow />
          <div className="relative grid items-center gap-14 lg:grid-cols-[minmax(0,1fr)_auto] lg:gap-20">
            <div>
              {lead}
              <div className="mt-9">{cta}</div>
            </div>
            <div className="relative flex justify-center lg:justify-end">
              {phone}
              <div className="pointer-events-none absolute inset-0">{badges}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={track} className="relative h-[200svh]">
      <div className="sticky top-0 flex h-[100svh] items-center justify-center overflow-hidden">
        {/* Финал. Лежит под кадром и открывается, когда тот уходит. */}
        <motion.div
          style={{ opacity: ctaOp, scale: ctaS }}
          className="absolute inset-0 flex items-center justify-center px-6 text-center"
        >
          {cta}
        </motion.div>

        <motion.div
          style={{ y: cardY, width: cardW, height: cardH, borderRadius: cardR }}
          className="relative z-10 flex items-center justify-center overflow-hidden border border-border bg-[var(--landing-bg)] shadow-[0_40px_90px_-55px_rgba(26,18,14,0.6)] dark:shadow-[0_40px_90px_-55px_rgba(0,0,0,0.95)]"
        >
          <Glow />

          {/* Крайние колонки равны, и это не вкусовщина: при разной
              ширине средняя уезжает в сторону широкой, и телефон
              переставал стоять по центру экрана. Имя марки выходит за
              свою колонку намеренно — оно и должно упираться в край. */}
          <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-10 px-6 md:px-14 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:gap-14">
            <motion.div style={{ x: leadX, opacity: leadOp }}>{lead}</motion.div>

            <div className="relative flex justify-center">
              <motion.div
                style={{
                  y: phY,
                  rotateX: phRot,
                  scale: phScale,
                  opacity: phOp,
                  transformPerspective: 1200,
                }}
              >
                {phone}
              </motion.div>

              <motion.div
                style={{ scale: badgeS, opacity: badgeOp }}
                className="pointer-events-none absolute inset-0"
              >
                {badges}
              </motion.div>
            </div>

            {/* Имя прижато к левому краю своей колонки, то есть сразу за
                телефоном, и убегает вправо, за край кадра. С прижатием к
                правому краю оно, наоборот, уползало ПОД аппарат и первая
                буква пропадала. */}
            <motion.div
              style={{ x: brandX, opacity: brandOp }}
              className="flex justify-center lg:justify-start"
            >
              {brand}
            </motion.div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/** Тёплый свет первого экрана. Один на оба состояния. */
function Glow() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute top-1/2 left-1/2 size-[34rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-55 blur-3xl md:size-[46rem] dark:opacity-100"
      style={{ background: 'radial-gradient(circle, rgba(255,74,0,0.20), rgba(255,74,0,0) 70%)' }}
    />
  );
}
