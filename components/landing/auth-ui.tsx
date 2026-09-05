'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

import {
  COUNTRIES,
  country as findCountry,
  DEFAULT_COUNTRY,
  groupNsn,
  nationalDigits,
} from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * Органы управления двери витрины.
 *
 * Собраны заново и не общие с кабинетом нарочно. В кабинете человек
 * работает: там поля в рамках, кнопки в грейпе, переключатели дорожкой —
 * плотный рабочий инструмент. Витрина это разворот: крупный набор,
 * волосяные линии, тёплый свет. Продуктовые органы внутри неё читались
 * вставкой из другой системы, и никакая перекраска этого не снимала,
 * потому что дело не в цвете, а в плотности.
 *
 * Общее правило форм: капсул нет. Скругление крупное, но рамка остаётся
 * прямоугольной — так же, как везде в продукте.
 *
 * Поля были без коробок: подпись, крупное значение и волосяная линия
 * снизу. Разворот витрины это выдерживал, окно входа — нет. На тёмном
 * грунте линия сливалась с фоном, и человек не видел, куда нажимать; на
 * регистрации таких невидимых мест оказалось пять подряд. Теперь у поля
 * есть рамка и заливка чуть светлее листа, а тёплый цвет достался
 * фокусу.
 */

/** Тёплый цвет витрины. Тот же, что горит в первом экране. */
const WARM = 'bg-[#c0390f] dark:bg-[#ff6a2a]';

/**
 * Вид главного действия.
 *
 * Строкой, а не только компонентом, потому что кнопок этого вида на
 * витрине три и они обязаны совпасть до точки: кнопка первого экрана,
 * кнопка у цены и прилипшая полоса на телефоне — плюс кнопка в самой
 * двери. Человек нажимает одну и сразу видит другую.
 */
export const ACTION = [
  'flex h-14 items-center justify-center gap-2.5 rounded-2xl px-6',
  'text-[15px] font-semibold tracking-[-0.01em]',
  WARM,
  'text-[#fffde3] dark:text-[#10100e]',
  'transition-[filter,transform] duration-150 hover:brightness-110 active:translate-y-px',
  'outline-none focus-visible:ring-3 focus-visible:ring-[#c0390f]/40 dark:focus-visible:ring-[#ff6a2a]/40',
  'disabled:pointer-events-none disabled:opacity-55',
].join(' ');

const WARM_TEXT = 'text-[#c0390f] dark:text-[#ff6a2a]';

/**
 * Подпись поля.
 *
 * Была мелкими прописными в разрядку — набор витрины. В окне входа он
 * оказался неуместен: прописные читаются медленнее строчных, а читать их
 * приходится подряд пять раз, по числу полей регистрации. Здесь обычный
 * регистр и обычный кегль, как в любой форме, которую человек уже
 * заполнял.
 */
const EYEBROW = 'block text-[13px] leading-none font-medium text-muted-foreground';

/**
 * Коробка поля.
 *
 * Раньше поля были без неё: подпись, значение и волосяная линия снизу.
 * На светлом листе это читалось, на тёмном — нет: линия сливалась с
 * фоном, и человек не видел, куда нажимать. Рамка отвечает на этот
 * вопрос до того, как он задан.
 *
 * Заливка чуть светлее листа, а не белая: окно стоит на тёмном грунте
 * витрины, и белое поле в нём было бы дырой.
 */
const BOX = [
  'h-12 w-full rounded-xl border border-border bg-foreground/[0.03] px-4',
  'text-[15px] tracking-[-0.01em] outline-none transition-[border-color,box-shadow]',
  'placeholder:text-muted-foreground/45',
  'focus-visible:border-[#c0390f] focus-visible:ring-3 focus-visible:ring-[#c0390f]/25',
  'dark:bg-white/[0.04] dark:focus-visible:border-[#ff6a2a] dark:focus-visible:ring-[#ff6a2a]/25',
].join(' ');

/**
 * Главное действие. Одно на экран.
 *
 * Тёплая заливка вместо грейпа кабинета: на витрине это цвет действия, и
 * кнопка обязана быть им же. Под курсором чуть растёт, при нажатии
 * уходит на точку вниз — то же движение, что у единственной кнопки
 * страницы.
 */
export function AuthButton({
  children,
  busy = false,
  className,
  ...rest
}: React.ComponentProps<'button'> & { busy?: boolean }) {
  const still = useReducedMotion();

  return (
    <motion.div
      className="w-full"
      whileHover={still || rest.disabled ? undefined : { scale: 1.015 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
    >
      <button
        {...rest}
        aria-busy={busy || undefined}
        className={cn(ACTION, 'w-full', className)}
      >
        {busy ? (
          <span
            aria-hidden
            className="size-4 animate-spin rounded-full border-2 border-current/30 border-t-current"
          />
        ) : null}
        {children}
      </button>
    </motion.div>
  );
}

/**
 * Второстепенное действие: строка, а не вторая кнопка.
 *
 * Главное действие на экране одно, и всё, что рядом с ним, обязано
 * выглядеть иначе по весу, а не только по цвету.
 */
export function AuthLink({
  children,
  className,
  ...rest
}: React.ComponentProps<'button'>) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        'text-[13px] text-muted-foreground underline decoration-border underline-offset-[5px]',
        'transition-colors hover:text-foreground hover:decoration-current',
        'outline-none focus-visible:text-foreground focus-visible:decoration-current',
        className,
      )}
    >
      {children}
    </button>
  );
}

/**
 * Поле без коробки: подпись сверху, крупное значение, линия снизу.
 *
 * `hint` — строка под линией, тихая. Не подсказка внутри поля: та
 * исчезает от первой буквы, а сказанное ею («не короче восьми знаков»,
 * «владелец входит почтой») нужно как раз в тот момент, когда человек
 * уже печатает.
 */
export function AuthField({
  label,
  hint,
  invalid = false,
  className,
  id: givenId,
  ...rest
}: React.ComponentProps<'input'> & { label: string; hint?: string; invalid?: boolean }) {
  const autoId = useId();
  const id = givenId ?? autoId;
  const hintId = `${id}-hint`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={id} className={EYEBROW}>
        {label}
      </label>
      <input
        id={id}
        {...rest}
        aria-invalid={invalid || undefined}
        aria-describedby={hint ? hintId : undefined}
        className={cn(BOX, invalid && 'border-[#c0390f] dark:border-[#ff6a2a]')}
      />
      {hint && (
        <p id={hintId} className="text-[12.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * Телефон: код страны и номер на одной линии.
 *
 * Код выбирается родным `select`, положенным поверх нарисованной
 * подписи: он ищется по буквам, крутится барабаном на iOS и понятен
 * читалке экрана без единого лишнего атрибута. Разбивка номера по
 * группам общая с кабинетом (`lib/phone.ts`) — вид разный, правила
 * одни.
 */
export function AuthPhone({
  label,
  countryLabel,
  name = 'phone',
  countryName = 'country',
  defaultCountry = DEFAULT_COUNTRY,
  defaultValue = '',
  autoComplete = 'tel',
  invalid = false,
  onChange,
}: {
  label: string;
  countryLabel: string;
  name?: string;
  countryName?: string;
  defaultCountry?: string;
  defaultValue?: string;
  autoComplete?: string;
  invalid?: boolean;
  onChange?: (nsn: string, countryCode: string) => void;
}) {
  const [code, setCode] = useState(defaultCountry);
  const [raw, setRaw] = useState(defaultValue);
  const id = useId();
  const c = findCountry(code);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className={EYEBROW}>
        {label}
      </label>

      <div className={cn(BOX, 'flex items-center gap-2 p-0 pl-4', invalid && 'border-[#c0390f] dark:border-[#ff6a2a]')}>
        <div className="flex w-full items-center gap-2">
          <span className="relative flex shrink-0 items-center gap-1.5 text-[15px] tracking-[-0.01em]">
            <span aria-hidden>{c.flag}</span>
            <span className="num" aria-hidden>
              +{c.dial}
            </span>
            <ChevronDown
              aria-hidden
              className="size-3.5 text-muted-foreground"
            />
            <select
              className="absolute inset-0 size-full cursor-pointer text-base opacity-0"
              name={countryName}
              value={code}
              aria-label={countryLabel}
              onChange={(e) => {
                setCode(e.target.value);
                onChange?.(raw, e.target.value);
              }}
            >
              {COUNTRIES.map((item) => (
                <option key={item.code} value={item.code}>
                  {item.flag} {item.code} +{item.dial}
                </option>
              ))}
            </select>
          </span>

          <input
            id={id}
            name={name}
            type="tel"
            inputMode="tel"
            autoComplete={autoComplete}
            required
            aria-invalid={invalid || undefined}
            value={groupNsn(raw, code)}
            onChange={(e) => {
              const digits = nationalDigits(e.target.value, code);
              setRaw(digits);
              onChange?.(digits, code);
            }}
            placeholder={c.example}
            className={cn(
              'num h-12 w-full min-w-0 bg-transparent pr-4 text-[15px] tracking-[0.01em] outline-none',
              'placeholder:text-muted-foreground/40',
              invalid && 'text-[#c0390f] dark:text-[#ff6a2a]',
            )}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Кто входит: два слова и подчёркивание, которое между ними переезжает.
 *
 * Не дорожка с плашкой. Дорожка — рабочий орган кабинета, где переключают
 * период отчёта по десять раз на дню; здесь выбор делают один раз и
 * навсегда, и он обязан читаться словом, а не кнопкой.
 */
export function AuthRoles({
  current,
  items,
  onSelect,
  label,
}: {
  current: string;
  items: { key: string; label: string }[];
  onSelect: (key: string) => void;
  label: string;
}) {
  const still = useReducedMotion();

  return (
    <div role="tablist" aria-label={label} className="flex items-center gap-7">
      {items.map((item) => {
        const on = item.key === current;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onSelect(item.key)}
            className={cn(
              'relative -mx-1 px-1 pb-2.5 text-[14px] font-medium transition-colors outline-none',
              'focus-visible:text-foreground',
              on
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {item.label}
            {on ? (
              <motion.span
                aria-hidden
                layoutId="tetrin-auth-role"
                className={cn('absolute inset-x-0 bottom-0 h-[2px]', WARM)}
                transition={
                  still
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 380, damping: 32 }
                }
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Заголовок шага: крупный набор витрины и подпись под ним. */
export function AuthHead({
  title,
  subtitle,
  className,
}: {
  title: string;
  subtitle: string;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* Заголовок окна, а не витрины: прежние тридцать точек прописными
          занимали четверть высоты и кричали там, где человек уже принял
          решение и просто хочет войти. */}
      <h2 className="font-wordmark text-[22px] leading-[1.1] tracking-[-0.01em] uppercase">
        {title}
      </h2>
      <p className="max-w-[36ch] text-[13.5px] leading-relaxed text-muted-foreground">
        {subtitle}
      </p>
    </div>
  );
}

/** Ошибка шага. Тёплым, а не красным: другого сигнального цвета на витрине нет. */
export function AuthError({ children }: { children?: string }) {
  if (!children) return null;
  return (
    <p role="alert" className={cn('text-[13px] leading-relaxed', WARM_TEXT)}>
      {children}
    </p>
  );
}
