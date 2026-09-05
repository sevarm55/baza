'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';

import { AuthTrigger } from '@/components/auth-buttons';
import { ACTION } from '@/components/landing/auth-ui';
import { cn } from '@/lib/utils';

/**
 * Прилипшая полоса с призывом. Только на телефоне.
 *
 * Витрина высотой в десять тысяч точек, и на телефоне это тридцать
 * экранов. Кнопка первого экрана уезжает через один поворот пальца, а
 * следующая стоит у цены — то есть человек, которого убедила третья
 * секция, нажать ему нечего до самого низа. Полоса возвращает действие
 * туда, где оно возникло.
 *
 * Появляется не сразу: пока первый экран в кадре, на нём есть своя
 * кнопка, и вторая под ней была бы дубликатом. Наблюдаем за самим первым
 * экраном, а не за расстоянием прокрутки — высота его на разных
 * аппаратах разная.
 *
 * На широком экране полосы нет: там кнопка первого экрана и кнопка цены
 * достаются без тридцати поворотов, а прибитая к низу строка отнимала бы
 * место у самой страницы.
 *
 * Поле снизу считает безопасную зону: под полосой домашняя черта, и без
 * него кнопка попадала бы под неё.
 */
export function Hail({ label, note }: { label: string; note: string }) {
  const still = useReducedMotion();
  const [shown, setShown] = useState(false);
  const seen = useRef(false);

  useEffect(() => {
    const hero = document.querySelector('section');
    if (!hero) return;

    const io = new IntersectionObserver(
      ([e]) => {
        /* Полоса не мигает на границе: она выезжает, когда первый экран
           ушёл, и прячется, только когда он вернулся целиком. */
        if (e.isIntersecting) {
          seen.current = true;
          setShown(false);
        } else if (seen.current) {
          setShown(true);
        }
      },
      { threshold: 0.15 },
    );

    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <motion.div
      aria-hidden={!shown}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-[var(--landing-bg)]/95 backdrop-blur-xl md:hidden',
        'px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
      )}
      initial={false}
      animate={{ y: shown || still ? '0%' : '110%' }}
      transition={
        still ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 30, mass: 0.7 }
      }
    >
      <AuthTrigger mode="register" className={cn(ACTION, 'w-full')}>
        {label}
      </AuthTrigger>
      <p className="mt-2 text-center text-[12px] text-muted-foreground">{note}</p>
    </motion.div>
  );
}
