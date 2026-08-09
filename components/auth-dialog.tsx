'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { IconClose } from '@/components/icons';
import { Logo } from '@/components/logo';
import { hy } from '@/lib/i18n/hy';
import { LoginForm } from '@/app/login/login-form';
import { RegisterForm } from '@/app/start/[niche]/register-form';
import s from './auth-dialog.module.css';

export type AuthMode = 'signIn' | 'register';

/**
 * Вход и регистрация — окном на месте, без перехода на страницу.
 *
 * Раньше и то и другое было отдельным адресом, а окно поверх страницы
 * рисовал перехват маршрута. Работало, но стоило дорого: клик по «Мутq»
 * менял адрес, лендинг под окном перерисовывался, а на медленной связи
 * между нажатием и появлением формы успевал мигнуть переход. Человеку в
 * этот момент нужна форма, а не навигация.
 *
 * Теперь это обычное окно рядом с кнопкой. Адрес не трогается вовсе.
 * Страницы `/login` и `/start/...` остались: на них уводит прокси
 * неавторизованных, по ним приходят из закладок и из письма — но внутри
 * сайта туда больше никто не ходит.
 *
 * Композиция широкая, а не столбиком. Узкое высокое окно заставляло
 * читать сверху вниз то, что читается сразу: слева — чей это продукт и
 * что человек получит, справа — два поля. На телефоне колонки
 * складываются в одну, и левая часть ужимается до логотипа со строкой.
 */
export function AuthDialog({
  mode,
  niche,
  onClose,
}: {
  mode: AuthMode | null;
  /** ниша для регистрации — с лендинга она известна заранее */
  niche: string;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<AuthMode>('signIn');

  useEffect(() => {
    if (mode) setTab(mode);
  }, [mode]);

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
        {/* Левая половина — чей это продукт. На телефоне от неё остаётся
            логотип и строка: место там дороже объяснений. */}
        <aside className={s.aside}>
          <Logo size={30} />
          <p className={s.pitch}>{hy.app.tagline}</p>
          <p className={s.asideNote}>{hy.landing.ctaNote}</p>
        </aside>

        <div className={s.form}>
          <button type="button" className={s.close} onClick={dismiss} aria-label={hy.common.cancel}>
            <IconClose />
          </button>

          {/* Две двери одной ручкой: человек, ошибшийся кнопкой на
              лендинге, не должен закрывать окно и искать другую. */}
          <div className={s.tabs} role="tablist">
            {(['signIn', 'register'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                className={s.tab}
                data-on={tab === k ? '' : undefined}
                onClick={() => setTab(k)}
              >
                {k === 'signIn' ? hy.auth.signInTitle : hy.onboarding.createAccount}
              </button>
            ))}
          </div>

          <div className={s.body}>
            {tab === 'signIn' ? <LoginForm /> : <RegisterForm nicheKey={niche} defaultName="" />}
          </div>
        </div>
      </div>
    </dialog>
  );
}
