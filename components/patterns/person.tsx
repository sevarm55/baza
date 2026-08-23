import type { ReactNode } from 'react';

import { personColor } from '@/lib/person-color';
import { cn } from '@/lib/utils';

/**
 * Человек в списке: кружок с первой буквой в его цвете и имя.
 * Один и тот же сотрудник всегда одного цвета (lib/person-color.ts).
 */
export function PersonAvatar({
  name,
  size = 'md',
  className,
}: {
  name: string | null | undefined;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const color = personColor(name);
  const letter = (name ?? '').trim().charAt(0).toUpperCase() || '·';
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white select-none',
        size === 'xs' && 'size-5 text-[10px]',
        size === 'sm' && 'size-6 text-[11px]',
        size === 'md' && 'size-7 text-xs',
        size === 'lg' && 'size-9 text-sm',
        className,
      )}
      style={{ background: color }}
    >
      {letter}
    </span>
  );
}

/** Точка цвета человека: там, где кружок с буквой был бы лишним. */
export function PersonDot({ name, className }: { name: string | null | undefined; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ background: personColor(name) }}
    />
  );
}

/** Имя с кружком и строкой пояснения. */
export function Person({
  name,
  note,
  size = 'md',
  className,
  right,
}: {
  name: string;
  note?: ReactNode;
  size?: 'sm' | 'md';
  className?: string;
  right?: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <PersonAvatar name={name} size={size === 'sm' ? 'sm' : 'md'} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{name}</div>
        {note && <div className="truncate text-xs text-muted-foreground">{note}</div>}
      </div>
      {right}
    </div>
  );
}
