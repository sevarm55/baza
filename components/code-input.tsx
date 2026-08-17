'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { IconEye, IconEyeOff } from '@/components/icons';
import s from './code-input.module.css';

/* Цифра не появляется, а приезжает: снизу, из размытия, за 0.22 с.
   Смысл не в красоте — движение показывает, КУДА попала цифра, когда
   клавиатура закрывает половину экрана и смотреть на ряд некогда.
   Уходит она вверх и быстрее, чтобы забой читался как отмена, а не как
   вторая такая же цифра. */
const ENTER = { duration: 0.22, ease: [0.23, 1, 0.32, 1] } as const;

/**
 * Поле для кода — PIN или кода из SMS.
 *
 * ГЛАВНОЕ РЕШЕНИЕ: клеток шесть, а поле одно.
 *
 * Шесть отдельных `input` — самый частый способ сделать такое поле и
 * самый плохой. Читалка экрана произносит шесть безымянных полей вместо
 * одного кода. Менеджер паролей не понимает, куда подставлять. Вставка
 * кода из буфера попадает в первую клетку и обрезается. Выделить и
 * стереть всё нельзя. На iOS автозаполнение из SMS кладёт весь код в
 * первую клетку. Каждую из этих поломок потом чинят руками, и каждая
 * возвращается при следующей правке.
 *
 * Здесь настоящее поле ровно одно, прозрачное, во всю площадь ряда, а
 * клетки под ним — картинка. Поэтому само собой работает всё, что
 * работает у обычного поля: вставка, забой, выделение, `Enter`,
 * `autocomplete="one-time-code"`, менеджеры паролей, VoiceOver, Dynamic
 * Type, физическая клавиатура.
 *
 * Автоотправка по последней цифре — только там, где её просят: вход это
 * повторяющееся движение, и лишнее нажатие в нём стоит дорого; создание
 * PIN при регистрации — нет, там человек ещё думает.
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
   * Сколько цифр достаточно, чтобы отправить.
   *
   * По умолчанию — все. Меньше нужно ровно там, где код ПРОВЕРЯЕТСЯ, а
   * не создаётся: у людей, зарегистрированных до перехода на шесть
   * цифр, код четырёхзначный, и требовать от них шесть значило бы
   * запереть им и смену кода, и удаление бизнеса. Новый код всегда
   * ровно шесть — это проверяет сервер.
   */
  minLength?: number;
  /** подпись, которую произносит читалка экрана: «PIN-код, 6 цифр» */
  label: string;
  /** видимая подпись над клетками; рядом с ней встаёт глазок */
  title?: string;
  autoFocus?: boolean;
  /** one-time-code для SMS, current-password / new-password для PIN */
  autoComplete?: string;
  submitOnComplete?: boolean;
  /**
   * Разбить ряд на группы по столько клеток.
   *
   * Ноль — не разбивать. Просвет посреди ряда нужен там, где код
   * ПЕРЕПИСЫВАЮТ с чужого экрана: 204 815 сверяется взглядом, 204815 —
   * пересчитывается пальцем. Для PIN, который набирают по памяти,
   * группировка бессмысленна и только режет узкий ряд в кабинете.
   */
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

  /* Раскрытый код не должен пережить уход со страницы: человек нажал
     глазок, отвернулся, а код остался светиться на чужом мониторе.
     Скрываем и при потере видимости вкладки, и при потере фокуса окна —
     это же покрывает сворачивание приложения на телефоне. */
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
     целиком, подсвечиваем последнюю — иначе кольцо уезжает за ряд. */
  const active = Math.min(value.length, length - 1);
  /* Код из SMS показывается цифрами: его переписывают с другого экрана,
     и точки вместо цифр лишили бы человека единственного способа
     проверить себя. PIN закрыт, пока не нажат глазок. */
  const plain = revealed || autoComplete === 'one-time-code';

  return (
    <div className="grid gap-2">
      {(title || revealable) && (
        <div className={s.head}>
          {/* Подпись и глазок в одной строке. Глазок сам по себе висел
              над клетками и читался как отдельный предмет — непонятно
              чей и непонятно зачем. Рядом с подписью он очевидно
              относится к полю под ней. */}
          <span className={s.caption}>{title}</span>
          {revealable && (
            <button
              type="button"
              className={s.reveal}
              onClick={() => {
                setRevealed((v) => !v);
                // фокус обязан вернуться в поле: иначе следующая цифра уходит в никуда
                input.current?.focus();
              }}
              aria-label={revealed ? hideLabel : revealLabel}
              aria-pressed={revealed}
              tabIndex={-1}
            >
              {revealed ? <IconEyeOff /> : <IconEye />}
            </button>
          )}
        </div>
      )}

      <div
        className={s.wrap}
        data-focus={focused ? '' : undefined}
        data-invalid={invalid ? '' : undefined}
      >
        <div className={s.cells} aria-hidden>
          {cells.map((digit, i) => (
            <div
              key={i}
              className={s.cell}
              data-filled={digit ? '' : undefined}
              data-active={i === active ? '' : undefined}
              data-gap={groupEvery > 0 && i > 0 && i % groupEvery === 0 ? '' : undefined}
            >
              <span className={s.glyphs}>
                {/* Цифра живёт в своей клетке и меняется на месте:
                    AnimatePresence на каждую клетку, а не на ряд —
                    иначе правка одной цифры пересобирала бы все шесть. */}
                <AnimatePresence initial={false} mode="popLayout">
                  {digit ? (
                    <motion.span
                      /* Ключ по тому, что ВИДНО. Под точками цифра
                         меняется молча: показывать движение там, где
                         картинка не изменилась, значит врать о вводе. */
                      key={plain ? digit : 'dot'}
                      className={s.glyph}
                      initial={reduced ? false : { opacity: 0, scale: 0.97, y: 9, filter: 'blur(6px)' }}
                      animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : { opacity: 0, scale: 0.98, y: -6, filter: 'blur(3px)' }
                      }
                      transition={reduced ? { duration: 0 } : ENTER}
                    >
                      {plain ? digit : <span className={s.dot} />}
                    </motion.span>
                  ) : null}
                </AnimatePresence>

                {/* Каретка. Настоящая спрятана — она одна на весь ряд и
                    стояла бы не в той клетке; эта показывает, куда
                    попадёт следующая цифра, и только пока поле в фокусе
                    и клетка пуста. */}
                {focused && !digit && i === active && !disabled && <span className={s.caret} />}
              </span>
            </div>
          ))}
        </div>

        <input
          ref={input}
          className={s.input}
          name={name}
          value={value}
          onChange={(e) => set(e.target.value)}
          /* Каретка всегда в конце. Внутри ряда клеток её не видно, и
             редактирование середины выглядело бы как поломка: цифра
             появляется не там, куда смотрел человек. */
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

      {/* Прогресс словами — для читалки экрана. Клетки для неё скрыты,
          и без этой строки человек не знает, сколько уже ввёл. */}
      <span id={describedBy} className="sr-only" aria-live="polite">
        {enteredLabel?.(value.length, length) ?? `${value.length}/${length}`}
      </span>
    </div>
  );
}
