'use client';

import { Check } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { useDelayedFlag } from './use-delayed';

/**
 * Кнопка, у которой «занято» и «нельзя» — разные состояния.
 *
 * Три подписи лежат стопкой в одной ячейке сетки: ширина кнопки равна
 * самой длинной из них и не меняется никогда. Засов стоит до
 * перерисовки: обработчик проверяет занятость сам и гасит второе
 * нажатие, не дожидаясь, пока кнопка изменится. `disabled` не ставится:
 * выключенная кнопка выпадает из порядка обхода, и человек, дошедший до
 * неё с клавиатуры, теряет место. Вместо него `aria-disabled` и та же
 * проверка в обработчике.
 */
export function LoadingButton({
  busy = false,
  done = false,
  disabled = false,
  label,
  busyLabel,
  doneLabel,
  icon,
  className,
  onClick,
  type = 'submit',
  variant,
  size,
  ...rest
}: {
  /** запрос летит */
  busy?: boolean;
  /** только что получилось */
  done?: boolean;
  /** действие недоступно: не хватает данных, нет прав, нечего сохранять */
  disabled?: boolean;
  label: ReactNode;
  /** «Сохраняем…»; пусто — остаётся обычная подпись и индикатор */
  busyLabel?: ReactNode;
  /** «Сохранено»; пусто — отметки об успехе у кнопки нет */
  doneLabel?: ReactNode;
  /** значок перед обычной подписью */
  icon?: ReactNode;
} & Omit<ComponentProps<typeof Button>, 'disabled' | 'type' | 'children'> & {
    type?: 'button' | 'submit' | 'reset';
  }) {
  /* Цвет отвечает мгновенно, а слово «Сохраняем…» догоняет через
     девяносто миллисекунд: быстрый ответ не должен успевать мигнуть
     чужой подписью. */
  const showBusyFace = useDelayedFlag(busy, 90);
  const canShowDone = doneLabel !== undefined;
  const face = busy && showBusyFace ? 'busy' : done && !busy && canShowDone ? 'done' : 'idle';

  return (
    <Button
      {...rest}
      type={type}
      variant={variant}
      size={size}
      className={cn(
        'relative',
        (busy || disabled) && 'cursor-default',
        disabled && !busy && 'opacity-50',
        busy && 'opacity-90',
        face === 'done' && 'bg-success text-white hover:bg-success',
        className,
      )}
      data-busy={busy ? 'true' : undefined}
      aria-busy={busy || undefined}
      aria-disabled={disabled || busy || undefined}
      onClick={(e) => {
        if (busy || disabled) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        onClick?.(e);
      }}
    >
      <span className="grid *:col-start-1 *:row-start-1">
        <Face on={face === 'idle'}>
          {icon}
          {label}
        </Face>
        <Face on={face === 'busy'}>
          <Spinner className="size-3.5" />
          {busyLabel ?? label}
        </Face>
        {doneLabel !== undefined && (
          <Face on={face === 'done'}>
            <Check className="size-3.5" aria-hidden />
            {doneLabel}
          </Face>
        )}
      </span>
    </Button>
  );
}

/** Одна подпись в стопке; скрытые не читаются чтецом экрана. */
function Face({ on, children }: { on: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center gap-1.5 whitespace-nowrap transition-opacity duration-150',
        on ? 'opacity-100' : 'pointer-events-none opacity-0',
      )}
      aria-hidden={on ? undefined : true}
    >
      {children}
    </span>
  );
}
