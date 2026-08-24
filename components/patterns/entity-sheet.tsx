'use client';

import type { ReactNode } from 'react';

import { useIsMobile } from '@/hooks/use-mobile';
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
 * Лист для добавления, правки и просмотра.
 *
 * Шапка и подвал прибиты, тело прокручивается. В подвале слева тихие
 * действия (удалить), справа пара «отмена + главное». Сам лист не
 * знает, что внутри: форму, её состояние и закрытие по успеху держит
 * тот, кто его открыл.
 *
 * На компьютере он выезжает справа, на телефоне — снизу. Не для
 * разнообразия: окно у правого края телефона требует дотянуться до
 * дальнего верхнего угла за крестиком, а лист снизу приезжает к руке и
 * уходит тем же движением, которым его позвали. Ровно так же устроены
 * все листы приложения.
 *
 * Сторона выбирается в браузере, и мигнуть чужой раскладкой не может:
 * до листа нельзя добраться иначе как нажатием, а нажатие бывает только
 * после того, как страница ожила.
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
  const isMobile = useIsMobile();
  const at = isMobile ? 'bottom' : side;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={at}
        className={cn(
          'w-full gap-0 p-0',
          width === 'md' && 'data-[side=right]:sm:max-w-[28rem]',
          width === 'lg' && 'data-[side=right]:sm:max-w-[36rem]',
          at === 'bottom' && 'max-h-[92svh] rounded-t-xl',
          /* Геометрия листа приложения: крупное скругление сверху,
             полотно табло вместо белого листа. */
          'max-md:rounded-t-m-hero max-md:border-m-hair max-md:bg-m-board',
        )}
      >
        <SheetHeader className="pr-12 max-md:px-4 max-md:pt-4">
          <SheetTitle className="truncate max-md:text-[17px] max-md:font-bold">{title}</SheetTitle>
          {description ? (
            <SheetDescription className="text-xs max-md:text-[12.5px]">
              {description}
            </SheetDescription>
          ) : (
            <SheetDescription className="sr-only">{title}</SheetDescription>
          )}
        </SheetHeader>
        <div
          className={cn(
            'scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 max-md:px-4',
            bodyClassName,
          )}
        >
          {children}
        </div>
        {footer && (
          <SheetFooter className="safe-bottom max-md:border-t max-md:border-m-hair max-md:bg-m-board max-md:px-4">
            {footer}
          </SheetFooter>
        )}
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
    /* На телефоне пара «отмена + главное» делит ширину поровну: два
       равноправных выхода одного размера, разница только в заливке. */
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:items-center">
      {start && <div className="flex items-center gap-2 max-md:justify-center sm:mr-auto">{start}</div>}
      <div className="flex items-center justify-end gap-2 *:min-w-24 max-md:*:flex-1 sm:ml-auto">
        {children}
      </div>
    </div>
  );
}
