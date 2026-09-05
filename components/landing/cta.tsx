'use client';

import { motion, useReducedMotion } from 'motion/react';

import { AuthTrigger } from '@/components/auth-buttons';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Единственная кнопка витрины. Открывает окно регистрации.
 *
 * Здесь была магнитная кнопка, тянущаяся к курсору. Убрана сознательно,
 * и стоит записать почему — без неё соблазн вернуть велик.
 *
 * Приём известен тем, что роняет клик: кнопка уезжает из-под указателя
 * между нажатием и отпусканием, браузер видит два разных элемента и
 * клика не засчитывает. Промахнуться легче всего у края, то есть ровно
 * там, где курсор оказывается после притяжения. Кнопка на витрине одна и
 * ведёт к регистрации; цена ошибки тут выше любого впечатления.
 *
 * Осталось движение, которое промахнуться не может в принципе: под
 * курсором кнопка чуть растёт. Увеличение только добавляет площади,
 * увести край из-под указателя оно неспособно. Нажатие рисует сама
 * кнопка — один пиксель вниз, как во всём продукте.
 */
export function Cta({ label, className }: { label: string; className?: string }) {
  const still = useReducedMotion();

  return (
    <motion.div
      className="inline-flex"
      whileHover={still ? undefined : { scale: 1.03 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <AuthTrigger
        mode="register"
        className={cn(buttonVariants({ size: 'lg' }), 'px-7 text-[15px]', className)}
      >
        {label}
      </AuthTrigger>
    </motion.div>
  );
}
