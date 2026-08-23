import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger' | 'brand' | 'lime';

const VARIANT: Record<StatusTone, 'muted' | 'success' | 'warning' | 'danger' | 'brand' | 'lime'> = {
  neutral: 'muted',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
  brand: 'brand',
  lime: 'lime',
};

const DOT: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
  brand: 'bg-primary',
  lime: 'bg-lime-ink',
};

/**
 * Компактный значок состояния: «на смене», «оплачено», «просрочено».
 * Мягкая подложка и тёмный текст того же тона; точка слева там, где
 * состояние живое (человек на смене сейчас).
 */
export function StatusBadge({
  tone = 'neutral',
  dot = false,
  children,
  className,
}: {
  tone?: StatusTone;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Badge variant={VARIANT[tone]} className={cn('gap-1.5', className)}>
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />}
      {children}
    </Badge>
  );
}
