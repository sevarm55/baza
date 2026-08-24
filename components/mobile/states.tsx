import type { ComponentType, ReactNode } from 'react';

import { cn } from '@/lib/utils';

/**
 * Состояния экрана: пусто, ошибка, ожидание.
 *
 * Пустой экран — это не «ноль во всех числах»: ноль выручки, пустая
 * полоса и график без точек выглядят как данные, которые надо изучать,
 * а изучать там нечего. Пусто — отдельное состояние с одной фразой и,
 * если есть что делать, одним действием.
 */
export function MEmpty({
  icon: Icon,
  title,
  note,
  action,
  className,
}: {
  icon?: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: ReactNode;
  note?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-m-card bg-m-tile px-6 py-10 text-center',
        className,
      )}
    >
      {Icon && (
        <span
          aria-hidden
          className="flex size-12 items-center justify-center rounded-full bg-m-grape/12 text-m-grape"
        >
          <Icon className="size-6" strokeWidth={1.9} />
        </span>
      )}
      <span className="text-[16px] leading-snug font-bold text-m-ink">{title}</span>
      {note && <span className="max-w-[30ch] text-[13.5px] leading-snug text-m-muted">{note}</span>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}

/**
 * Место содержимого, пока оно едет.
 *
 * Скелет повторяет форму того, что приедет, а не крутится кружком:
 * человек должен узнать экран раньше, чем на нём появятся числа.
 */
export function MBone({
  className,
  height = 16,
  width,
  radius = 'row',
}: {
  className?: string;
  height?: number | string;
  width?: number | string;
  radius?: 'row' | 'tile' | 'full';
}) {
  return (
    <span
      aria-hidden
      className={cn(
        'block animate-pulse bg-m-tile',
        radius === 'row' && 'rounded-m-chip',
        radius === 'tile' && 'rounded-m-tile',
        radius === 'full' && 'rounded-full',
        className,
      )}
      style={{ height, width }}
    />
  );
}

/** Скелет корневого экрана: заголовок, крупное число, фишки, две плитки. */
export function MScreenSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <MBone height={30} width="55%" />
      <MBone height={52} width="72%" />
      <div className="flex gap-2">
        <MBone height={40} width={96} radius="full" />
        <MBone height={40} width={110} radius="full" />
        <MBone height={40} width={88} radius="full" />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <MBone height={116} radius="tile" />
        <MBone height={116} radius="tile" />
        <MBone height={116} radius="tile" />
        <MBone height={116} radius="tile" />
      </div>
      <MBone height={72} radius="tile" />
      <MBone height={72} radius="tile" />
    </div>
  );
}
