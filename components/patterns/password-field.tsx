'use client';

import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Поле пароля в кабинете.
 *
 * Одно на все три места, где пароль вводят внутри: свой текущий, свой
 * новый и тот, который владелец выдаёт сотруднику. Раньше на этих
 * местах стояли клетки для шести цифр — от ПИНа, которого в продукте
 * больше нет; пароль в клетки не помещается.
 *
 * Кнопка показа стоит под полем, а не внутри него: внутри она
 * перекрывала бы последние знаки ровно тогда, когда их и хотят увидеть.
 * Тот же приём, что в двери витрины (`components/auth-surface.tsx`) —
 * два разных решения на один вопрос человек читает как два разных поля.
 *
 * `shown` начальным значением, а не только по нажатию: пароль
 * сотруднику владелец придумывает вслух, стоя рядом с ним, и обязан
 * видеть, что набрал.
 */
export function PasswordField({
  name,
  label,
  hint,
  autoComplete,
  invalid = false,
  autoFocus = false,
  openByDefault = false,
  value,
  onChange,
}: {
  name: string;
  label: string;
  hint?: string;
  autoComplete: 'current-password' | 'new-password' | 'off';
  invalid?: boolean;
  autoFocus?: boolean;
  /** показывать набранное сразу */
  openByDefault?: boolean;
  /** управляемое поле: нужно там, где пароли сверяются между собой */
  value?: string;
  onChange?: (value: string) => void;
}) {
  const t = useT();
  const id = useId();
  const [shown, setShown] = useState(openByDefault);

  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        name={name}
        type={shown ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        required
        aria-invalid={invalid || undefined}
        {...(onChange ? { value, onChange: (e) => onChange(e.target.value) } : {})}
      />
      {hint && <FieldDescription className="text-xs">{hint}</FieldDescription>}
      <button
        type="button"
        onClick={() => setShown((v) => !v)}
        aria-pressed={shown}
        className={cn(
          'flex items-center gap-1.5 self-start text-xs text-muted-foreground',
          'transition-colors outline-none hover:text-foreground focus-visible:text-foreground',
        )}
      >
        {shown ? <EyeOff aria-hidden className="size-3.5" /> : <Eye aria-hidden className="size-3.5" />}
        {shown ? t.auth.hidePassword : t.auth.showPassword}
      </button>
    </Field>
  );
}
