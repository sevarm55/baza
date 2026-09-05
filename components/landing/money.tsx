'use client';

import { useEffect, useRef } from 'react';
import { useMotionValueEvent, useReducedMotion, useSpring } from 'motion/react';

import { formatMoney } from '@/lib/money';

/**
 * Сумма, которая догоняет цель пружиной.
 *
 * Число пишется прямо в узел, минуя отрисовку React: счёт до тысяч идёт
 * шестьдесят раз в секунду, и каждый кадр стоил бы перерисовки всего
 * поддерева. При «уменьшении движения» сумма просто стоит на месте.
 */
export function Money({
  value,
  locale,
  className,
}: {
  value: number;
  locale: string;
  className?: string;
}) {
  const still = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  /* Пружина живее прежней (было 90/22): суммы обязаны догонять ленту, а
     она теперь идёт в полтора раза быстрее. Отставший счётчик читается
     не спокойствием, а задумчивостью. */
  const spring = useSpring(0, { stiffness: 150, damping: 24 });

  useEffect(() => {
    if (still) return;
    spring.set(value);
  }, [value, spring, still]);

  useMotionValueEvent(spring, 'change', (v) => {
    if (ref.current) ref.current.textContent = formatMoney(Math.round(v), 'AMD', locale);
  });

  return (
    <span ref={ref} className={className}>
      {formatMoney(still ? value : 0, 'AMD', locale)}
    </span>
  );
}
