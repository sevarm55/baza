'use client';

import { useEffect, useRef, useState } from 'react';

const LENGTH = 4;

/**
 * PIN четырьмя клетками.
 *
 * Обычное поле пароля здесь работает против человека: мойщик вводит
 * четыре цифры мокрыми пальцами, и ему нужно видеть, сколько уже набрал,
 * а не считать точки. Клетки показывают прогресс сами, попасть в них
 * легче, а после четвёртой цифры форма уходит без нажатия кнопки —
 * это на одно движение меньше в действии, которое повторяют каждый день.
 */
export function PinInput({ name = 'pin' }: { name?: string }) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const hidden = useRef<HTMLInputElement>(null);
  const submitted = useRef(false);

  const value = digits.join('');

  // Отправляем, как только набрана последняя цифра. Флаг нужен, чтобы
  // исправление уже введённого не слало форму повторно.
  useEffect(() => {
    if (value.length < LENGTH) {
      submitted.current = false;
      return;
    }
    if (submitted.current) return;
    submitted.current = true;
    hidden.current?.form?.requestSubmit();
  }, [value]);

  function setAt(index: number, digit: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const only = raw.replace(/\D/g, '');
    if (!only) {
      setAt(index, '');
      return;
    }

    // Вставка целого кода или быстрый набор: раскладываем по клеткам
    if (only.length > 1) {
      setDigits((prev) => {
        const next = [...prev];
        for (let i = 0; i < only.length && index + i < LENGTH; i++) {
          next[index + i] = only[i];
        }
        return next;
      });
      refs.current[Math.min(index + only.length, LENGTH - 1)]?.focus();
      return;
    }

    setAt(index, only);
    refs.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      // забой на пустой клетке уводит назад — иначе курсор застревает
      e.preventDefault();
      setAt(index - 1, '');
      refs.current[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft') refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight') refs.current[index + 1]?.focus();
  }

  return (
    <div className="flex gap-2.5" role="group">
      <input ref={hidden} type="hidden" name={name} value={value} readOnly />
      {digits.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className="field field-key !px-0 !py-3.5 flex-1"
          value={digit}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          inputMode="numeric"
          autoComplete="off"
          aria-label={`PIN ${i + 1}`}
          maxLength={LENGTH}
        />
      ))}
    </div>
  );
}
