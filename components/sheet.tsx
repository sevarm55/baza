'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from '@/components/icons';

/**
 * Окно правки поверх страницы.
 *
 * На нативном `<dialog>`, а не на своём слое: ловушка фокуса, Escape,
 * затемнение и верхний слой достаются бесплатно и работают правильно —
 * своя реализация всего этого обычно ошибается на клавиатуре.
 *
 * Открывается по нажатию на строку списка. Правка «на месте» из списка
 * убрана: число, которое меняется прямо под рукой, легко задеть, а
 * «сохранить» в такой строке всегда оказывается где-то сбоку.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const head = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      /* `showModal` сам наводится на первое поле. На телефоне это
         мгновенно выбрасывает клавиатуру поверх окна, которое человек
         ещё не прочитал, поэтому цель фокуса ставится заранее — на
         заголовок. */
      head.current?.setAttribute('autofocus', '');
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  /* Размер, центр, фон и поле заданы прямо здесь, а не только классом.
     Окно живёт в верхнем слое браузера, и если стиль по какой-то
     причине не доехал (первая отрисовка, старый кэш, сборка в момент
     правки), `<dialog>` разворачивается в браузерный дефолт: белая
     коробка во всю ширину, поля навылет, кнопка через весь экран.
     Класс остаётся — он несёт анимацию и тона полотна, — но каркас
     держится сам.

     `inset: 0` вместе с `margin: auto` — это и есть центр: четыре
     нуля прижимают окно ко всем краям сразу, а автополя делят остаток
     поровну. Без них браузер ставит окно по своему умолчанию, и в
     верхнем слое оно оказывается где угодно, только не посередине.

     Фон сплошной, без `color-mix`: сборщик раскладывает его на фолбэк
     `background: var(--board-ink)`, и в браузере без `color-mix` панель
     заливалась чернилами — тёмным по тёмному. */
  return (
    <dialog
      ref={ref}
      className="sheet"
      style={{
        position: 'fixed',
        inset: 0,
        margin: 'auto',
        width: 'min(420px, calc(100vw - 2rem))',
        maxHeight: 'calc(100dvh - 3rem)',
        padding: '1.4rem',
        borderRadius: 'var(--radius-card)',
        background: 'var(--board-surface2)',
        color: 'var(--on-board)',
      }}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // клик по затемнению: цель события — сам <dialog>, а не панель
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      onClose={onClose}
    >
      <div ref={head} tabIndex={-1} className="mb-4 flex items-start justify-between gap-3">
        <h2 className="text-[16px] leading-tight font-semibold tracking-[-0.015em]">{title}</h2>
        <button
          type="button"
          className="btn-icon btn-icon-board -mt-0.5 -me-0.5"
          onClick={onClose}
          aria-label="Փակել"
        >
          <IconClose className="size-4" />
        </button>
      </div>

      {children}
    </dialog>
  );
}
