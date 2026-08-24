'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Wordmark } from '@/components/wordmark';
import { AuthSurface } from '@/components/auth-surface';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import type { RememberedWebAccount } from '@/lib/auth';
import { cn } from '@/lib/utils';

export type AuthMode = 'signIn' | 'register';

/**
 * Вход и регистрация окном, и только окном.
 *
 * Отдельных страниц нет: `/login` и `/start/…` уводят сюда же. Клик по
 * «Войти» не меняет адрес, витрина под окном не перерисовывается.
 *
 * Окно живёт на нативном `<dialog>`: затемнение, ловушка фокуса, Escape
 * и возврат фокуса на кнопку после закрытия приходят от браузера, и свой
 * каркас поверх него был бы хуже во всём, что касается доступности.
 * Переключателя языка внутри нет намеренно: окно в верхнем слое, и
 * выпадающий список оказался бы под ним; язык выбирают в шапке витрины.
 *
 * На телефоне окно становится листом снизу: приходит от края, к
 * которому ближе палец.
 */
export function AuthDialog({
  mode,
  niche,
  remembered,
  trialDays,
  onClose,
}: {
  mode: AuthMode | null;
  /** ниша для регистрации: с витрины она известна заранее */
  niche: string;
  remembered?: RememberedWebAccount | null;
  trialDays: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const t = useT();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;

    if (mode && !dialog.open) {
      /* Цель фокуса задаётся заранее: `showModal` сначала ищет autofocus
         и только потом берёт первое поле. Без этого на телефоне
         клавиатура выскакивает раньше, чем человек прочитал, что ему
         предлагают. */
      panel.current?.setAttribute('autofocus', '');
      dialog.showModal();
      requestAnimationFrame(() => setOpen(true));
    }
    if (!mode && dialog.open) dialog.close();
  }, [mode]);

  const dismiss = useCallback(() => {
    setOpen(false);
    // ждём выезд: снятое сразу окно исчезает рывком
    window.setTimeout(() => {
      ref.current?.close();
      onClose();
    }, 200);
  }, [onClose]);

  if (mode === null && !open) return null;

  return (
    <dialog
      ref={ref}
      data-open={open ? 'true' : undefined}
      aria-label={mode === 'register' ? t.auth.createTitle : t.auth.welcome}
      className={cn(
        'fixed inset-0 m-auto max-h-full w-fit max-w-full overflow-visible bg-transparent p-0 text-foreground',
        'max-sm:mb-0 max-sm:w-full',
        'backdrop:bg-black/0 backdrop:transition-colors backdrop:duration-200 data-open:backdrop:bg-black/25',
      )}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      /* Клик мимо панели закрывает: попадание приходится на сам dialog,
         потому что панель внутри перехватывает своё. */
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'flex max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-1.5rem))] flex-col rounded-xl border border-border bg-card p-6 outline-none',
          /* На телефоне окно входа — тот же лист снизу, что и всюду в
             мобильном слое: белый, с крупным скруглением сверху и полем
             под домашнюю черту. */
          'max-sm:max-h-[calc(100dvh-2.5rem)] max-sm:w-full max-sm:rounded-b-none max-sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
          'max-md:rounded-t-m-sheet max-md:border-0 max-md:bg-m-bg max-md:px-4',
          'translate-y-2 opacity-0 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none',
          'in-data-open:translate-y-0 in-data-open:opacity-100',
        )}
      >
        <div className="mb-5 flex items-center justify-between">
          {/* Марка набранная: знак обязан совпасть с тем, что человек
              только что читал в шапке витрины. */}
          <Wordmark className="text-[15px]" />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-my-1 -mr-2 text-muted-foreground"
            onClick={dismiss}
            aria-label={t.common.close}
          >
            <X aria-hidden />
          </Button>
        </div>

        {/* Поля прокрутки уводим наружу, чтобы кольцо фокуса не обрезалось. */}
        <div className="-mx-6 min-h-0 overflow-y-auto overscroll-contain px-6 max-md:-mx-4 max-md:px-4">
          <AuthSurface
            mode={mode ?? 'signIn'}
            niche={niche}
            remembered={remembered}
            trialDays={trialDays}
          />
        </div>
      </div>
    </dialog>
  );
}
