'use client';

import type { ReactNode } from 'react';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Правый лист для добавления, правки и просмотра.
 *
 * Шапка и подвал прибиты, тело прокручивается. В подвале слева тихие
 * действия (удалить), справа пара «отмена + главное». Сам лист не
 * знает, что внутри: форму, её состояние и закрытие по успеху держит
 * тот, кто его открыл.
 *
 * `width` — `md` для форм в одну колонку (28rem), `lg` для карточек с
 * историей (36rem).
 */
export function EntitySheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = 'md',
  bodyClassName,
  side = 'right',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: 'md' | 'lg';
  bodyClassName?: string;
  side?: 'right' | 'bottom';
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        className={cn(
          'w-full gap-0 p-0',
          width === 'md' && 'data-[side=right]:sm:max-w-[28rem]',
          width === 'lg' && 'data-[side=right]:sm:max-w-[36rem]',
          side === 'bottom' && 'max-h-[92svh] rounded-t-xl',
        )}
      >
        <SheetHeader className="pr-12">
          <SheetTitle className="truncate">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs">{description}</SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div className={cn('scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>
          {children}
        </div>
        {footer && <SheetFooter className="safe-bottom">{footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Подвал листа: тихое действие слева (удалить), пара справа.
 * Обе правые кнопки одного размера; разницу несёт заливка.
 */
export function SheetActions({
  start,
  children,
}: {
  /** что стоит слева: обычно удаление */
  start?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
      {start && <div className="flex items-center gap-2 sm:mr-auto">{start}</div>}
      <div className="flex items-center justify-end gap-2 *:min-w-24 sm:ml-auto">{children}</div>
    </div>
  );
}
