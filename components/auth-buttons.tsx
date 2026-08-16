'use client';

import { useEffect, useState } from 'react';
import { AuthDialog, type AuthMode } from '@/components/auth-dialog';
import type { RememberedWebAccount } from '@/lib/auth';

/**
 * Вход и регистрация живут ТОЛЬКО в окне.
 *
 * Отдельных страниц больше нет: `/login` и `/start/…` остались адресами,
 * но уводят сюда же — на витрину с открытым окном. Причина простая: две
 * поверхности для одного действия расходятся. Правку вносят в окно,
 * страница остаётся прежней, и человек, пришедший по ссылке из письма,
 * видит вчерашний продукт.
 *
 * Окно на странице ОДНО, а кнопок несколько — в шапке, на первом экране,
 * у цены. Раньше каждая кнопка носила с собой свою копию окна: четыре
 * копии состояния, четыре формы в разметке и общий `SwitchMark`, который
 * между ними прыгал. Теперь окно одно, а кнопки только просят его
 * открыться.
 */

const EVENT = 'tetrin:auth';

export function AuthTrigger({
  mode,
  className,
  children,
}: {
  mode: AuthMode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => window.dispatchEvent(new CustomEvent<AuthMode>(EVENT, { detail: mode }))}
    >
      {children}
    </button>
  );
}

/**
 * Само окно. Ставится на страницу один раз.
 *
 * `initial` — то, с чем пришли по адресу: `/?auth=signIn` открывает окно
 * сразу. Так работают и переход из письма, и возврат прокси, и ссылка
 * «войти» откуда угодно снаружи.
 */
export function AuthPortal({
  initial = null,
  niche,
  remembered,
  trialDays,
}: {
  initial?: AuthMode | null;
  niche: string;
  remembered?: RememberedWebAccount | null;
  trialDays: number;
}) {
  const [open, setOpen] = useState<AuthMode | null>(initial);

  useEffect(() => {
    const listen = (e: Event) => setOpen((e as CustomEvent<AuthMode>).detail);
    window.addEventListener(EVENT, listen);
    return () => window.removeEventListener(EVENT, listen);
  }, []);

  return (
    <AuthDialog
      key={open ?? 'closed'}
      mode={open}
      niche={niche}
      remembered={remembered}
      trialDays={trialDays}
      onClose={() => {
        setOpen(null);
        /* Адрес чистим, если пришли по нему: иначе «назад» снова
           открывает окно, которое человек только что закрыл. */
        if (window.location.search.includes('auth=')) {
          window.history.replaceState(null, '', window.location.pathname);
        }
      }}
    />
  );
}
