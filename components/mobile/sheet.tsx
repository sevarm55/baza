'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import { Drawer, DrawerClose, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * Лист снизу — то, чем в приложении спрашивают и выбирают.
 *
 * Не окно посреди экрана. Окно в центре телефона требует дотянуться до
 * середины большим пальцем и закрывается крестиком в дальнем углу; лист
 * приезжает снизу, к руке, и уходит движением вниз — тем же, которым
 * его сюда и позвали.
 *
 * Скругление сверху крупное (28), под ним затемнение, сверху ручка.
 * Содержимое прокручивается, действия остаются прибитыми к низу и
 * держат поле под домашнюю черту.
 */
export function MobileSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
  /** во весь экран: сложная форма, а не вопрос */
  full = false,
  closeLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  full?: boolean;
  closeLabel: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down" showSwipeHandle>
      <DrawerContent
        className={cn(
          'rounded-t-m-hero! border-m-hair! bg-m-board! text-m-ink!',
          full &&
            'data-[swipe-axis=y]:[--drawer-content-max-height:96dvh] [--drawer-height:96dvh]',
          className,
        )}
      >
        {(title || description) && (
          <div className="m-pad-x relative shrink-0 pt-1 pb-3">
            {title && (
              <DrawerTitle className="pr-11 text-left text-[17px] leading-tight font-bold text-m-ink">
                {title}
              </DrawerTitle>
            )}
            {description && (
              <DrawerDescription className="mt-1 pr-11 text-left text-[13px] leading-snug text-m-muted">
                {description}
              </DrawerDescription>
            )}
            <DrawerClose
              aria-label={closeLabel}
              className="m-press absolute top-0 right-4 flex size-[38px] items-center justify-center rounded-m-tile bg-m-inset text-m-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <X aria-hidden className="size-[17px]" />
            </DrawerClose>
          </div>
        )}

        <div className="m-pad-x min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {children}
        </div>

        {footer && (
          <div
            className="m-pad-x shrink-0 border-t border-m-hair bg-m-board pt-3"
            style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 12px)' }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: 'calc(var(--m-safe-bottom) + 8px)' }} />}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Полноэкранная форма поверх экрана.
 *
 * То же, что `fullScreenCover` в приложении: запись машины занимает
 * весь экран, потому что на ней три вещи, которые должны быть видны
 * одновременно — номер, услуги и оплата.
 *
 * Своя шапка с крестиком слева и заголовком по центру; справа пустое
 * место той же ширины, иначе заголовок стоит по центру остатка, а не
 * экрана, и это заметно.
 */
export function MobileCover({
  open,
  onOpenChange,
  title,
  children,
  footer,
  closeLabel,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <DrawerContent
        className={cn(
          'rounded-t-none! border-0! bg-m-board! text-m-ink!',
          /* Форма занимает экран целиком. У базового листа своя верхняя
             граница в `100dvh - 6rem`, объявленная под тем же вариантом,
             и перебить её можно только тем же вариантом. */
          'data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] [--drawer-height:100dvh]',
          className,
        )}
      >
        <div
          className="m-pad-x flex shrink-0 items-center gap-2 pt-1.5 pb-3"
          style={{ paddingTop: 'calc(var(--m-safe-top) + 6px)' }}
        >
          <DrawerClose
            aria-label={closeLabel}
            className="m-press flex size-[38px] shrink-0 items-center justify-center rounded-m-tile bg-m-inset text-m-muted outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X aria-hidden className="size-[15px]" strokeWidth={2.5} />
          </DrawerClose>

          <DrawerTitle className="min-w-0 flex-1 truncate text-center text-[15px] font-semibold text-m-ink">
            {title}
          </DrawerTitle>

          <span aria-hidden className="size-[38px] shrink-0" />
        </div>

        {/* Прокрутка отпускает клавиатуру: на форме с полем и длинным
            списком иначе не добраться до низа, не закрыв её руками. */}
        <div className="m-pad-x min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          {children}
        </div>

        {footer && (
          <div
            className="m-pad-x shrink-0 border-t border-m-hair bg-m-board pt-3"
            style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 10px)' }}
          >
            {footer}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
