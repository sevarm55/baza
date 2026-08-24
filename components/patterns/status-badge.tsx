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
  neutral: 'bg-muted-foreground max-md:bg-m-faint',
  success: 'bg-success max-md:bg-[#170b2b]',
  warning: 'bg-warning max-md:bg-m-warn',
  danger: 'bg-destructive max-md:bg-m-bad',
  brand: 'bg-primary max-md:bg-m-grape',
  lime: 'bg-lime-ink max-md:bg-[#170b2b]',
};

/**
 * На телефоне у знака состояния всего два вида, и оба из двух цветов
 * продукта: живое лаймовое, всё остальное тихое. Зелёный, янтарный и
 * красный остаются десктопу — там они стоят в таблице среди других
 * знаков, а здесь были бы третьим и четвёртым цветом на белом листе.
 */
const M_TONE: Record<StatusTone, string> = {
  neutral: 'max-md:bg-m-tile max-md:text-m-muted',
  success: 'max-md:bg-m-lime max-md:text-[#170b2b]',
  warning: 'max-md:bg-m-tile max-md:text-m-warn',
  danger: 'max-md:bg-m-tile max-md:text-m-bad',
  brand: 'max-md:bg-m-grape max-md:text-white',
  lime: 'max-md:bg-m-lime max-md:text-[#170b2b]',
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
    <Badge
      variant={VARIANT[tone]}
      className={cn(
        'gap-1.5',
        'max-md:h-8 max-md:rounded-full max-md:border-0 max-md:px-3 max-md:text-[13px] max-md:font-semibold',
        M_TONE[tone],
        className,
      )}
    >
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', DOT[tone])} />}
      {children}
    </Badge>
  );
}
