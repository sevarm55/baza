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
 * Поля без коробок. Подпись стоит над строкой мелкими прописными в
 * разрядку, значение набирается крупно, снизу волосяная линия. В фокусе
 * поверх неё выезжает вторая, тёплая и в два раза толще: ширина линии не
 * меняется, поэтому раскладка не дёргается, а указатель фокуса виден
 * издалека.
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

const EYEBROW =
  'block text-[11px] leading-none font-medium tracking-[0.16em] text-muted-foreground uppercase';

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

/** Линия под полем: волосяная всегда, тёплая и толстая в фокусе. */
function Rule() {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 block h-[2px]"
    >
      <span className="absolute inset-x-0 bottom-0 h-px bg-border" />
      <span
        className={cn(
          'absolute inset-x-0 bottom-0 h-[2px] origin-left scale-x-0',
          'transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]',
          'peer-focus-within:scale-x-100 peer-focus:scale-x-100',
          WARM,
        )}
      />
    </span>
  );
}

/** Поле без коробки: подпись сверху, крупное значение, линия снизу. */
export function AuthField({
  label,
  invalid = false,
  className,
  ...rest
}: React.ComponentProps<'input'> & { label: string; invalid?: boolean }) {
  const id = useId();

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      <label htmlFor={id} className={EYEBROW}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          {...rest}
          aria-invalid={invalid || undefined}
          className={cn(
            'peer w-full bg-transparent pb-3 text-[19px] tracking-[-0.01em] outline-none',
            'placeholder:text-muted-foreground/45',
            invalid && 'text-[#c0390f] dark:text-[#ff6a2a]',
          )}
        />
        <Rule />
      </div>
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
    <div className="flex flex-col gap-3">
      <label htmlFor={id} className={EYEBROW}>
        {label}
      </label>

      <div className="relative">
        <div className="peer flex items-baseline gap-3 pb-3">
          <span className="relative flex shrink-0 items-center gap-1.5 text-[19px] tracking-[-0.01em]">
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
              'num w-full min-w-0 bg-transparent text-[19px] tracking-[0.01em] outline-none',
              'placeholder:text-muted-foreground/40',
              invalid && 'text-[#c0390f] dark:text-[#ff6a2a]',
            )}
          />
        </div>
        <Rule />
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
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="font-wordmark text-[26px] leading-[1.08] tracking-[-0.015em] uppercase md:text-[30px]">
        {title}
      </h2>
      <p className="max-w-[34ch] text-[14px] leading-relaxed text-muted-foreground">
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
