'use client';

import type { ReactNode } from 'react';
import { X } from 'lucide-react';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { cn } from '@/lib/utils';

/**
 * Лист снизу — то, чем на телефоне спрашивают и выбирают.
 *
 * Не окно посреди экрана. Окно в центре требует дотянуться до середины
 * большим пальцем и закрывается крестиком в дальнем углу; лист
 * приезжает снизу, к руке, и уходит движением вниз — тем же, которым
 * его сюда и позвали.
 *
 * Скругление сверху тридцать: столько же у плавающей полосы вкладок, и
 * лист выглядит поднявшимся с того же дна, а не приехавшим из другой
 * системы. Заголовок крупный, слева; крестик круглый, справа;
 * содержимое прокручивается, действия остаются прибитыми к низу и
 * держат поле под домашнюю черту.
 */
export function MSheet({
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
          'rounded-t-m-sheet! border-0! bg-m-bg! text-m-ink!',
          full && 'data-[swipe-axis=y]:[--drawer-content-max-height:96dvh] [--drawer-height:96dvh]',
          className,
        )}
      >
        {(title || description) && (
          <div className="m-pad-x relative shrink-0 pt-1 pb-4">
            {title && (
              <DrawerTitle className="pr-12 text-left text-[22px] leading-tight font-bold tracking-[-0.02em] text-m-ink">
                {title}
              </DrawerTitle>
            )}
            {description && (
              <DrawerDescription className="mt-1.5 pr-12 text-left text-[13.5px] leading-snug text-m-muted">
                {description}
              </DrawerDescription>
            )}
            <DrawerClose
              aria-label={closeLabel}
              className="m-press absolute top-0 right-4 flex size-10 items-center justify-center rounded-full bg-m-tile text-m-muted outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
            >
              <X aria-hidden className="size-[18px]" strokeWidth={2.2} />
            </DrawerClose>
          </div>
        )}

        <div className="m-pad-x min-h-0 flex-1 overflow-y-auto overscroll-contain pb-2">
          {children}
        </div>

        {footer && (
          <div
            className="m-pad-x shrink-0 bg-m-bg pt-3"
            style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 14px)' }}
          >
            {footer}
          </div>
        )}
        {!footer && <div style={{ height: 'calc(var(--m-safe-bottom) + 10px)' }} />}
      </DrawerContent>
    </Drawer>
  );
}

/**
 * Полноэкранный поток поверх экрана.
 *
 * Запись машины занимает весь экран, потому что на ней три вещи,
 * которые должны быть видны одновременно: номер, услуги и оплата. Своя
 * шапка с крестиком слева и заголовком по центру; справа пустое место
 * той же ширины, иначе заголовок стоит по центру остатка, а не экрана,
 * и это заметно.
 */
export function MCover({
  open,
  onOpenChange,
  title,
  step,
  children,
  footer,
  closeLabel,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  /** шаг потока справа от заголовка: «2 из 3» */
  step?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  closeLabel: string;
  className?: string;
}) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange} swipeDirection="down">
      <DrawerContent
        className={cn(
          'rounded-t-none! border-0! bg-m-bg! text-m-ink!',
          /* Поток занимает экран целиком. У базового листа своя верхняя
             граница в `100dvh - 6rem`, объявленная под тем же вариантом,
             и перебить её можно только тем же вариантом. */
          'data-[swipe-axis=y]:[--drawer-content-max-height:100dvh] [--drawer-height:100dvh]',
          className,
        )}
      >
        <div
          className="m-pad-x flex shrink-0 items-center gap-2 pb-3"
          style={{ paddingTop: 'calc(var(--m-safe-top) + 10px)' }}
        >
          <DrawerClose
            aria-label={closeLabel}
            className="m-press flex size-11 shrink-0 items-center justify-center rounded-full bg-m-tile text-m-ink outline-none focus-visible:ring-2 focus-visible:ring-m-grape/40"
          >
            <X aria-hidden className="size-[18px]" strokeWidth={2.4} />
          </DrawerClose>

          <DrawerTitle className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-m-ink">
            {title}
          </DrawerTitle>

          {step ? (
            <span className="num flex h-11 shrink-0 items-center rounded-full bg-m-tile px-3 text-[13px] font-semibold text-m-muted">
              {step}
            </span>
          ) : (
            <span aria-hidden className="size-11 shrink-0" />
          )}
        </div>

        {/* Прокрутка отпускает клавиатуру: на форме с полем и длинным
            списком иначе не добраться до низа, не закрыв её руками. */}
        <div className="m-pad-x min-h-0 flex-1 overflow-y-auto overscroll-contain pb-4">
          {children}
        </div>

        {footer && (
          <div
            className="m-pad-x shrink-0 border-t border-m-hair bg-m-bg pt-3"
            style={{ paddingBottom: 'calc(var(--m-safe-bottom) + 12px)' }}
          >
            {footer}
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}
