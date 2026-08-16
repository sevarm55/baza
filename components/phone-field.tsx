'use client';

import { useState } from 'react';
import { COUNTRIES, country as findCountry, DEFAULT_COUNTRY } from '@/lib/phone';
import s from './phone-field.module.css';

/**
 * Ввод телефона.
 *
 * Три вещи, ради которых это отдельный компонент, а не `input type=tel`:
 *
 *   код страны выбирается, а не нарисован — иначе человек с российским
 *   номером не может ввести его вообще;
 *   номер разбивается на группы прямо во время набора — восемь цифр
 *   подряд глазом не проверить, а человек проверяет свой номер всегда;
 *   в форму уходит нормализованный E.164, а не то, что видно на экране.
 *
 * И отдельно про последнее: красивая строка на экране — это украшение,
 * а не проверка. Сервер нормализует номер заново и заново же решает,
 * настоящий ли он. Здешнее форматирование ничего не гарантирует и
 * гарантировать не должно.
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
}) {
  const [code, setCode] = useState(defaultCountry);
  const [raw, setRaw] = useState(defaultValue);

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
       восьмёркой, со скобками. Оставляем цифры и, если человек вставил
       номер вместе с кодом выбранной страны, код отрезаем — иначе он
       уедет в национальную часть и номер станет длиннее настоящего. */
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
    <label className="grid gap-2">
      <span className={s.label}>{label}</span>

      <div className={s.row} data-invalid={invalid ? '' : undefined}>
        <div className={s.country}>
          <span className={s.flag} aria-hidden>
            {c.flag}
          </span>
          <span aria-hidden>+{c.dial}</span>
          <svg className={s.chevron} width="10" height="10" viewBox="0 0 16 16" aria-hidden>
            <path
              d="m4 6.5 4 4 4-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>

          {/* Родной select, а не рисованный список: он ищет по буквам,
              крутится барабаном на iOS и понятен читалке экрана без
              единого дополнительного атрибута. Флаг — только картинка;
              сущность здесь телефонный код. */}
          <select
            className={s.select}
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

        <input
          className={s.input}
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
      </div>
    </label>
  );
}
