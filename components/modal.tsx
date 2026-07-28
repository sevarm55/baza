'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import s from './modal.module.css';

const EXIT_MS = 280;

/**
 * Окно поверх страницы, за которым стоит настоящий адрес.
 *
 * Закрытие — не просто `router.back()`: если уйти сразу, окно исчезнет
 * рывком, потому что React снимет его с экрана раньше, чем доиграет
 * анимация. Поэтому сначала запускаем выезд, ждём его и только потом
 * возвращаемся назад.
 */
export function Modal({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const closing = useRef(false);
  const router = useRouter();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    // кадр задержки, иначе браузер не увидит смену состояния и не анимирует
    const id = requestAnimationFrame(() => setOpen(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    setOpen(false);
    setTimeout(() => router.back(), EXIT_MS);
  }, [router]);

  return (
    <dialog
      ref={ref}
      data-open={open}
      className={s.dialog}
      // Escape закрываем сами — иначе окно схлопнется без анимации
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
      // клик по затемнению: цель события — сам <dialog>, а не его содержимое
      onClick={(e) => {
        if (e.target === ref.current) close();
      }}
    >
      <div className={s.panel}>
        <div className={s.grip} aria-hidden />
        {children}
        <button className={`btn-icon ${s.close}`} onClick={close} aria-label="Փակել">
          ✕
        </button>
      </div>
    </dialog>
  );
}
