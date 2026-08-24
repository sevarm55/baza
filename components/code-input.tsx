'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import s from './code-input.module.css';

/* Цифра не появляется, а приезжает: снизу, из размытия, за 0.22 с.
   Движение показывает, КУДА попала цифра, когда клавиатура закрывает
   половину экрана. Уходит вверх и быстрее, чтобы забой читался как
   отмена, а не как вторая такая же цифра. */
const ENTER = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * Поле для кода: PIN или код из SMS.
 *
 * ГЛАВНОЕ РЕШЕНИЕ: клеток шесть, а поле одно.
 *
 * Шесть отдельных `input` ломают читалку экрана, менеджер паролей,
 * вставку из буфера и автозаполнение из SMS. Здесь настоящее поле ровно
 * одно, прозрачное, во всю площадь ряда, а клетки под ним картинка.
 * Поэтому само собой работает всё, что работает у обычного поля.
 *
 * Автоотправка по последней цифре только там, где её просят: вход это
 * повторяющееся движение, а создание кода нет.
 */
export function CodeInput({
  name,
  length = 6,
  minLength,
  label,
  title,
  autoFocus = false,
  autoComplete = 'one-time-code',
  submitOnComplete = false,
  groupEvery = 0,
  revealable = false,
  invalid = false,
  disabled = false,
  value: controlled,
  onChange,
  onComplete,
  revealLabel,
  hideLabel,
  enteredLabel,
}: {
  name: string;
  length?: number;
  /**
   * Сколько цифр достаточно, чтобы отправить. По умолчанию все. Меньше
   * нужно там, где код ПРОВЕРЯЕТСЯ: у зарегистрированных до перехода на
   * шесть цифр код четырёхзначный. Новый код всегда шесть, это проверяет
   * сервер.
   */
  minLength?: number;
  /** подпись для читалки экрана: «Код доступа, 6 цифр» */
  label: string;
  /** видимая подпись над клетками; рядом с ней встаёт глазок */
  title?: string;
  autoFocus?: boolean;
  /** one-time-code для SMS, current-password / new-password для PIN */
  autoComplete?: string;
  submitOnComplete?: boolean;
  /** разбить ряд на группы по столько клеток; ноль не разбивать */
  groupEvery?: number;
  revealable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  value?: string;
  onChange?: (value: string) => void;
  onComplete?: (value: string) => void;
  revealLabel?: string;
  hideLabel?: string;
  enteredLabel?: (entered: number, total: number) => string;
}) {
  const [inner, setInner] = useState('');
  const value = controlled ?? inner;
  const reduced = useReducedMotion();

  const [focused, setFocused] = useState(false);
  const [revealed, setRevealed] = useState(false);

  const input = useRef<HTMLInputElement>(null);
  const fired = useRef(false);
  const describedBy = useId();

  /* Раскрытый код не переживает уход со страницы: прячем при потере
     видимости вкладки и фокуса окна, это же покрывает сворачивание
     приложения на телефоне. */
  useEffect(() => {
    if (!revealed) return;
    const hide = () => setRevealed(false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
    };
  }, [revealed]);

  /* Отправка по последней цифре. Флаг нужен, чтобы правка уже набранного
     не слала форму второй раз. */
  useEffect(() => {
    if (value.length < length) {
      fired.current = false;
      return;
    }
    if (fired.current) return;
    fired.current = true;

    onComplete?.(value);
    if (submitOnComplete) input.current?.form?.requestSubmit();
  }, [value, length, submitOnComplete, onComplete]);

  function set(next: string) {
    const digits = next.replace(/\D/g, '').slice(0, length);
    if (controlled === undefined) setInner(digits);
    onChange?.(digits);
  }

  const cells = Array.from({ length }, (_, i) => value[i] ?? '');
  /* Активна клетка, куда попадёт следующая цифра. Когда код набран
     целиком, подсвечиваем последнюю. */
  const active = Math.min(value.length, length - 1);
  /* Код из SMS показывается цифрами: его переписывают с другого экрана.
     PIN закрыт, пока не нажат глазок. */
  const plain = revealed || autoComplete === 'one-time-code';

  return (
    <div className="flex flex-col gap-2">
      {(title || revealable) && (
        <div className="flex min-h-7 items-center justify-between gap-3">
          <span className="text-sm leading-none font-medium">{title}</span>
          {revealable && (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="-my-1 -mr-1 text-muted-foreground"
              onClick={() => {
                setRevealed((v) => !v);
                // фокус обязан вернуться в поле: иначе следующая цифра уходит в никуда
                input.current?.focus();
              }}
              aria-label={revealed ? hideLabel : revealLabel}
              aria-pressed={revealed}
              tabIndex={-1}
            >
              {revealed ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
            </Button>
          )}
        </div>
      )}

      <div
        className="group/code relative w-fit max-w-full"
        data-focus={focused ? '' : undefined}
        data-invalid={invalid ? '' : undefined}
      >
        <div className={cn('flex gap-2', invalid && s.shake)} aria-hidden>
          {cells.map((digit, i) => (
            <div
              key={i}
              data-filled={digit ? '' : undefined}
              data-active={i === active ? '' : undefined}
              data-gap={groupEvery > 0 && i > 0 && i % groupEvery === 0 ? '' : undefined}
              className={cn(
                /* На телефоне клетки крупнее: шесть цифр набирают одной
                   рукой, и попадать надо не в клетку, а в поле целиком —
                   но видеть, куда встанет следующая цифра, всё равно
                   нужно. */
                'num relative flex h-11 w-10 items-center justify-center rounded-md border border-input bg-card text-lg font-semibold text-foreground transition-colors',
                'max-md:h-[54px] max-md:w-[46px] max-md:rounded-m-tile max-md:text-[22px]',
                'data-gap:ml-2',
                'data-filled:border-foreground/30',
                /* Кольцо на одной клетке, куда попадёт следующая цифра. */
                'group-data-focus/code:data-active:border-ring group-data-focus/code:data-active:ring-3 group-data-focus/code:data-active:ring-ring/50',
                /* Ошибка сильнее фокуса: ряд остаётся красным, пока не исправлен. */
                'group-data-invalid/code:border-destructive group-data-invalid/code:data-active:border-destructive group-data-invalid/code:data-active:ring-destructive/20',
                disabled && 'opacity-50',
              )}
            >
              <span className="absolute inset-0 grid place-items-center">
                {/* Цифра живёт в своей клетке и меняется на месте:
                    AnimatePresence на каждую клетку, а не на ряд. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {digit ? (
                    <motion.span
                      /* Ключ по тому, что ВИДНО: под точками цифра меняется молча. */
                      key={plain ? digit : 'dot'}
                      className="col-start-1 row-start-1 grid place-items-center"
                      initial={reduced ? false : { opacity: 0, scale: 0.97, y: 9, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.98, y: -6, filter: 'blur(3px)' }
                      }
                      transition={reduced ? { duration: 0 } : ENTER}
                    >
                      {plain ? digit : <span className="size-2 rounded-full bg-current" />}
                    </motion.span>
                  ) : null}
                </AnimatePresence>

                {/* Рисованная каретка: настоящая одна на весь ряд и стояла бы
                    не в той клетке. Видна только в фокусе и в пустой клетке. */}
                {focused && !digit && i === active && !disabled && (
                  <span className="col-start-1 row-start-1 h-[18px] w-0.5 animate-caret-blink rounded-[1px] bg-current duration-1000" />
                )}
              </span>
            </div>
          ))}
        </div>

        {/* Настоящее поле: прозрачное и во всю площадь клеток, лежит СВЕРХУ,
            потому что по нему попадает палец. Своя обводка фокуса снята:
            место ввода показывает сама клетка. */}
        <input
          ref={input}
          className="absolute inset-0 m-0 size-full cursor-text border-0 bg-transparent p-0 text-transparent caret-transparent outline-none selection:bg-transparent [-webkit-tap-highlight-color:transparent] [-webkit-text-fill-color:transparent] [letter-spacing:2em] [text-indent:-999em] focus-visible:outline-none"
          name={name}
          value={value}
          onChange={(e) => set(e.target.value)}
          /* Каретка всегда в конце: внутри ряда клеток её не видно, и
             правка середины выглядела бы поломкой. */
          onSelect={(e) => {
            const el = e.currentTarget;
            if (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length) {
              el.setSelectionRange(el.value.length, el.value.length);
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          inputMode="numeric"
          /* pattern подсказывает Safari цифровую клавиатуру там, где
             inputMode он игнорирует */
          pattern="[0-9]*"
          maxLength={length}
          minLength={minLength ?? length}
          required
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          disabled={disabled}
          aria-label={label}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          enterKeyHint="go"
        />
      </div>

      {/* Прогресс словами для читалки экрана: клетки для неё скрыты. */}
      <span id={describedBy} className="sr-only" aria-live="polite">
        {enteredLabel?.(value.length, length) ?? `${value.length}/${length}`}
      </span>
    </div>
  );
}
