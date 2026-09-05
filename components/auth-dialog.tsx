'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

import { Grain } from '@/components/landing/grain';
import { AuthSurface } from '@/components/auth-surface';
import { BRAND } from '@/lib/brand';
import { useT } from '@/lib/i18n/client';
import type { RememberedWebAccount } from '@/lib/auth';
import { cn } from '@/lib/utils';

export type AuthMode = 'signIn' | 'register';

/**
 * Дверь витрины. Вход и регистрация окном, и только окном.
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
 * Не карточка по центру, а лист во всю высоту у правого края.
 *
 * Причина не в моде на панели. Карточка посреди экрана — предмет,
 * положенный поверх страницы: она обязана быть небольшой, иначе перестаёт
 * быть карточкой, а небольшая коробка заставляет набирать крупный шрифт
 * витрины мелко и жать поля в рамки. Лист у края ничем не ограничен по
 * высоте: заголовок в нём звучит в полный голос, поля идут без коробок, и
 * между ними остаётся воздух — то же устройство, что у самой витрины.
 * Страница при этом никуда не девается: она видна слева и приглушена, то
 * есть человек не ушёл со страницы, а открыл в ней дверь.
 *
 * На телефоне лист занимает экран целиком и приходит снизу, от края, к
 * которому ближе палец.
 *
 * Зерно у листа своё. Общий слой витрины лежит под верхним слоем
 * браузера, то есть под окном, и без своего шума панель была бы
 * единственным гладким местом на странице.
 *
 * Затемнение тёплое (#10100E) и размытое, а не чёрное: чёрный поверх
 * кремового листа читается дырой, а тёмный лист витрины — тенью.
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

    if (mode) {
      if (!dialog.open) {
        /* Цель фокуса задаётся заранее: `showModal` сначала ищет autofocus
           и только потом берёт первое поле. Без этого на телефоне
           клавиатура выскакивает раньше, чем человек прочитал, что ему
           предлагают. */
        panel.current?.setAttribute('autofocus', '');
        dialog.showModal();
      }
      /* Выезд включается всегда, а не только вместе с `showModal`.
         Состояние живёт в React, а открытость — в самом узле, и они
         расходятся при перемонтировании: узел уже открыт, включать выезд
         некому, и лист остаётся прозрачным поверх затемнения. */
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
    }, 260);
  }, [onClose]);

  if (mode === null && !open) return null;

  return (
    <dialog
      ref={ref}
      data-open={open ? 'true' : undefined}
      aria-label={mode === 'register' ? t.auth.createTitle : t.auth.welcome}
      className={cn(
        /* Окно по центру, а не панель у края.
           Панель во всю высоту была ошибкой, и видно её стало на
           регистрации: у формы пять полей, а у панели девятьсот точек
           высоты, и поля расползались по ней с провалами между собой.
           Окно по содержимому такого выбора не оставляет — оно ровно
           такой высоты, сколько в нём есть.
           На телефоне оно приходит снизу и занимает ширину целиком:
           там до верхнего края не дотянуться большим пальцем. */
        'fixed inset-0 m-0 h-full max-h-full w-full max-w-full',
        'grid place-items-center overflow-y-auto overscroll-contain bg-transparent p-4',
        'max-sm:place-items-end max-sm:p-0',
        'text-foreground',
        'backdrop:bg-transparent backdrop:transition-[background-color,backdrop-filter] backdrop:duration-300',
        'data-open:backdrop:bg-[#10100e]/60 data-open:backdrop:backdrop-blur-[4px]',
      )}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      /* Клик мимо листа закрывает: попадание приходится на сам dialog,
         потому что панель внутри перехватывает своё. */
      onClick={(e) => {
        if (e.target === ref.current) dismiss();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          'relative isolate flex w-full flex-col overflow-hidden outline-none',
          /* Ширина обычного окна входа, а не половины экрана. Высота по
             содержимому; когда его больше экрана, прокручивается сам
             `dialog` снаружи, и кольцо фокуса не обрезается. */
          'w-[min(26rem,100%)] rounded-[1.75rem] border border-border bg-[var(--landing-bg)]',
          'max-sm:w-full max-sm:rounded-b-none max-sm:rounded-t-[1.75rem] max-sm:border-x-0 max-sm:border-b-0',
          /* Появление из размытия и той же кривой, что у текста витрины
             (`components/landing/reveal.tsx`): на широком экране окно
             чуть подрастает, на телефоне лист приходит снизу. */
          'scale-[0.97] opacity-0 blur-[8px] max-sm:scale-100 max-sm:translate-y-10',
          'transition-[opacity,transform,filter] duration-[360ms] ease-[cubic-bezier(0.16,1,0.3,1)]',
          'in-data-open:scale-100 in-data-open:opacity-100 in-data-open:blur-[0px]',
          'max-sm:in-data-open:translate-y-0',
          'motion-reduce:scale-100 motion-reduce:translate-y-0 motion-reduce:blur-[0px] motion-reduce:transition-none',
        )}
      >
        {/* Отсвет первого экрана. Тот же тёплый свет, что горит в кадре
            наверху, заходит в верх листа: дверь открывается поверх него и
            обязана быть из той же страницы. Градиент встроенным стилем, а
            не классом: у него запятые внутри, и в разметке он читался бы
            строкой шума. */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-32 -right-20 size-[22rem] rounded-full opacity-70 blur-3xl dark:opacity-100"
          style={{
            background: 'radial-gradient(circle, rgba(255,74,0,0.20), rgba(255,74,0,0) 70%)',
          }}
        />

        <Grain inside />

        <header className="relative z-10 flex shrink-0 items-center justify-between px-7 pt-6 pb-2 max-sm:px-6">
          {/* Марка ровно та же, что в шапке витрины: прописные Unbounded
              в мелкую разрядку. Человек читал её десять секунд назад. */}
          <span className="font-wordmark text-[16px] leading-none tracking-[0.06em] select-none">
            {BRAND.toUpperCase()}
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label={t.common.close}
            className={cn(
              '-mr-2 flex size-9 items-center justify-center rounded-xl text-muted-foreground',
              'transition-colors hover:bg-foreground/[0.06] hover:text-foreground',
              'outline-none focus-visible:ring-3 focus-visible:ring-[#c0390f]/40 dark:focus-visible:ring-[#ff6a2a]/40',
            )}
          >
            <X aria-hidden className="size-[18px]" />
          </button>
        </header>

        {/* Прокрутки внутри окна нет намеренно: прокручивается сам
            `dialog` снаружи. Внутренняя обрезала бы кольцо фокуса у
            крайних полей и уводила бы кнопку под невидимый край. */}
        <div
          className={cn(
            'relative z-10 flex flex-col',
            'px-7 pt-2 pb-8 max-sm:px-6 max-sm:pb-[calc(2rem+env(safe-area-inset-bottom))]',
          )}
        >
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
