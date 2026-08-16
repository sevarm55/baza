'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClose } from '@/components/icons';
import { Logo } from '@/components/logo';
import { AuthSurface } from '@/components/auth-surface';
import { useT } from '@/lib/i18n/client';
import type { RememberedWebAccount } from '@/lib/auth';
import s from './auth-dialog.module.css';

export type AuthMode = 'signIn' | 'register';

/**
 * Вход и регистрация — окном, и только окном.
 *
 * Отдельных страниц больше нет: `/login` и `/start/…` уводят сюда же.
 * Клик по «Войти» не меняет адрес — витрина под окном не
 * перерисовывается, и между нажатием и появлением формы ничего не
 * мигает.
 *
 * Одна колонка, четыреста точек в ширину. Прежнее окно было широким, с
 * фотографией в половину: снимок объяснял, чей это продукт, — но
 * объяснять это человеку, который уже нажал «Войти», поздно. На
 * телефоне окно становится листом снизу: оно им и является — приходит
 * от края, к которому ближе палец.
 *
 * Переключателя языка внутри НЕТ, и это не забывчивость. Окно открыто
 * через `showModal()`, то есть живёт в верхнем слое браузера, а
 * выпадающий список уходит в `body` — и оказывается ПОД окном. Чинить
 * это порталами ради выбора, который делают один раз в жизни, дороже,
 * чем поставить переключатель в шапку витрины, где он и нужен: язык
 * выбирают до того, как нажали «Войти», а не посреди ввода кода.
 *
 * Что здесь именно про окно, а не про форму: затемнение с размытием,
 * ловушка фокуса, Escape, возврат фокуса на кнопку после закрытия.
 * Первые два даёт нативный `<dialog>` — свой каркас поверх него был бы
 * заведомо хуже во всём, что касается доступности.
 */
export function AuthDialog({
  mode,
  niche,
  remembered,
  trialDays,
  onClose,
}: {
  mode: AuthMode | null;
  /** ниша для регистрации — с лендинга она известна заранее */
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
         клавиатура выскакивает поверх окна раньше, чем человек успел
         прочитать, что ему предлагают. */
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
    }, 220);
  }, [onClose]);

  if (mode === null && !open) return null;

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      data-open={open ? 'true' : undefined}
      aria-label={mode === 'register' ? t.auth.createTitle : t.auth.welcome}
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
      <div ref={panel} className={s.panel} tabIndex={-1}>
        <div className={s.form}>
          <div className={s.top}>
            <Logo size={26} />
            <button
              type="button"
              className={s.close}
              onClick={dismiss}
              aria-label={t.common.close}
            >
              <IconClose width={16} height={16} />
            </button>
          </div>

          <div className={s.body}>
            <AuthSurface
              mode={mode ?? 'signIn'}
              niche={niche}
              remembered={remembered}
              trialDays={trialDays}
            />
          </div>
        </div>
      </div>
    </dialog>
  );
}
