'use client';

import { useId, useState } from 'react';
import { ChevronDown } from 'lucide-react';

import { Field, FieldLabel } from '@/components/ui/field';
import { InputGroup, InputGroupInput } from '@/components/ui/input-group';
import { COUNTRIES, country as findCountry, DEFAULT_COUNTRY } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * Ввод телефона: код страны и номер в одной строке.
 *
 * Три вещи, ради которых это отдельный компонент, а не `input type=tel`:
 * код страны выбирается, а не нарисован; номер разбивается на группы
 * прямо во время набора; в форму уходят `country` и национальная часть
 * номера, а нормализует и проверяет их сервер заново.
 */
export function PhoneField({
  name = 'phone',
  countryName = 'country',
  label,
  countryLabel,
  defaultCountry = DEFAULT_COUNTRY,
  defaultValue = '',
  autoFocus = false,
  autoComplete = 'tel',
  invalid = false,
  required = true,
  onChange,
  className,
}: {
  name?: string;
  countryName?: string;
  label: string;
  countryLabel: string;
  defaultCountry?: string;
  defaultValue?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  invalid?: boolean;
  required?: boolean;
  onChange?: (nsn: string, countryCode: string) => void;
  className?: string;
}) {
  const [code, setCode] = useState(defaultCountry);
  const [raw, setRaw] = useState(defaultValue);
  const id = useId();

  const c = findCountry(code);
  const max = Math.max(...c.nsn);

  /** Разбить набранное по группам страны: 77123456 → 77 123 456 */
  function pretty(digits: string): string {
    const parts: string[] = [];
    let at = 0;
    for (const size of c.groups) {
      if (at >= digits.length) break;
      parts.push(digits.slice(at, at + size));
      at += size;
    }
    if (at < digits.length) parts.push(digits.slice(at));
    return parts.join(' ');
  }

  function handle(next: string) {
    /* Вставленный номер может прийти с кодом страны, с плюсом, с
       восьмёркой. Оставляем цифры и отрезаем код выбранной страны,
       иначе он уедет в национальную часть. */
    let digits = next.replace(/\D/g, '');

    if (digits.length > max) {
      if (digits.startsWith(c.dial)) digits = digits.slice(c.dial.length);
      else if (digits.startsWith('0')) digits = digits.slice(1);
    }

    digits = digits.slice(0, max);
    setRaw(digits);
    onChange?.(digits, code);
  }

  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>

      {/* Номер набирают на телефоне чаще всего: поле там выше и
          крупнее, а клавиатура поднимается телефонная. */}
      <InputGroup className="h-10 max-md:h-[52px]">
        {/* Код страны: родной `select` поверх нарисованной кнопки. Он ищет
            по буквам, крутится барабаном на iOS и понятен читалке экрана
            без единого дополнительного атрибута. Флаг только картинка. */}
        <div
          data-align="inline-start"
          className={cn(
            'relative order-first flex h-full shrink-0 items-center gap-1 rounded-l-lg border-r border-border pr-2 pl-2.5 text-sm font-medium whitespace-nowrap select-none',
            'has-[select:focus-visible]:bg-muted has-[select:focus-visible]:ring-3 has-[select:focus-visible]:ring-ring/50',
          )}
        >
          <span className="text-base leading-none" aria-hidden>
            {c.flag}
          </span>
          <span className="num" aria-hidden>
            +{c.dial}
          </span>
          <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />

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
        </div>

        <InputGroupInput
          id={id}
          className="num"
          name={name}
          value={pretty(raw)}
          onChange={(e) => handle(e.target.value)}
          type="tel"
          inputMode="tel"
          placeholder={c.example}
          autoComplete={autoComplete}
          autoFocus={autoFocus}
          required={required}
          aria-invalid={invalid || undefined}
          enterKeyHint="next"
        />
      </InputGroup>
    </Field>
  );
}
