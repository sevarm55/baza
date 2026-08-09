'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { IconClose } from '@/components/icons';
import s from './modal.module.css';

const EXIT_MS = 280;

/**
 * Окно поверх страницы, за которым стоит настоящий адрес.
 *
 * Закрытие — не просто `router.back()`: если уйти сразу, окно исчезнет
 * рывком, потому что React снимет его с экрана раньше, чем доиграет
 * анимация. Поэтому сначала запускаем выезд, ждём его и только потом
 * возвращаемся назад.
 *
 * `path` — адрес, которому окно принадлежит. Он обязателен, потому что
 * параллельный слот не забывает своё содержимое сам: уйдя с `/start/...`
 * не «назад», а редиректом (после регистрации или выхода), окно
 * оставалось висеть поверх следующей страницы. Сверяемся с адресом
 * сами — и снимаем окно, как только он перестал быть нашим.
 */
export function Modal({ path, children }: { path: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const closing = useRef(false);
  const router = useRouter();
  const mine = usePathname() === path;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // showModal сам наводится на первое поле формы. На телефоне это
    // мгновенно выбрасывает клавиатуру поверх только что открывшегося
    // окна — человек ещё не прочитал, что ему предлагают.
    //
    // Отбирать фокус после открытия недостаточно: поле успевает его
    // получить, и в браузере остаётся подсветка. Поэтому ставим цель
    // заранее — по спецификации showModal сначала ищет элемент с
    // autofocus и только потом берёт первый попавшийся. Ловушка фокуса
    // и Escape при этом работают как обычно, а поле дождётся, пока в
    // него ткнут.
    panel.current?.setAttribute('autofocus', '');
    if (!dialog.open) dialog.showModal();
    // подстраховка для браузеров, которые ищут autofocus только у полей
    if (dialog.contains(document.activeElement) && document.activeElement !== panel.current) {
      panel.current?.focus();
    }
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

  // проверка после хуков: их порядок должен быть одинаковым на всех отрисовках
  if (!mine) return null;

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
      <div ref={panel} tabIndex={-1} className={s.panel}>
        {/* Содержимое прокручивается внутри окна, а не растит его за край
            экрана: регистрация длиннее входа, и на телефоне кнопка
            «Создать» иначе оказывается вне видимой части. */}
        <div className={s.body}>{children}</div>
        <button className={`btn-icon ${s.close}`} onClick={close} aria-label="Փակել">
          <IconClose className="size-4" />
        </button>
      </div>
    </dialog>
  );
}
