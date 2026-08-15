'use client';

import { useActionState, useState } from 'react';
import { Plus } from 'lucide-react';
import { addStaff, type FormState } from '@/app/actions';
import { Sheet } from '@/components/sheet';
import { useT } from '@/lib/i18n/client';

/**
 * Найм.
 *
 * Форма занимала правую колонку страницы всегда — треть ширины под пять
 * полей, которые нужны раз в полгода, — а список людей, ради которого
 * раздел открывают, жил в оставшихся двух третях. Теперь форма приходит
 * по нажатию и уходит.
 *
 * Внутри та же граница, что в карточке сотрудника: сначала кто это,
 * потом чем он входит. Телефон и PIN — не «ещё два поля», а ключ от
 * кабинета, и то, что код диктуют вслух и его не надо запоминать,
 * сказано прямо здесь, а не выясняется потом.
 */
export function AddStaff({
  staffRole,
  variant = 'head',
}: {
  staffRole: string;
  /** в заголовке раздела — тихой кнопкой, в пустом месте — главной */
  variant?: 'head' | 'cta';
}) {
  const t = useT();
  const [state, action, pending] = useActionState<FormState, FormData>(addStaff, null);
  const [open, setOpen] = useState(false);

  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state?.ok) setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        className={variant === 'cta' ? 'btn btn-auto' : 'btn-inline'}
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" aria-hidden />
        {t.settings.addStaff}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} side title={t.settings.addStaff}>
        {/* Ключом стоит признак открытия: закрыл, не сохранив, и открыл
            снова — поля пустые, а не с прошлым недописанным человеком. */}
        <form key={String(open)} action={action} className="grid gap-3">
          <label className="grid gap-1.5">
            <span className="label">{t.settings.name}</span>
            <input className="field auth-field" name="name" required autoComplete="off" autoFocus />
          </label>

          <label className="grid gap-1.5">
            <span className="label">
              {t.settings.percent} · {staffRole}
            </span>
            <div className="relative">
              {/* Знак слева, как «+374» у телефона: все украшения полей в
                  продукте стоят в начале — справа их взгляд ищет
                  отдельно, а слева они читаются вместе с первым знаком
                  числа. */}
              <input
                className="field auth-field num !ps-8"
                name="percent"
                type="number"
                inputMode="numeric"
                min={0}
                max={100}
                defaultValue={40}
                required
              />
              <span className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[15px] text-faint">
                %
              </span>
            </div>
          </label>

          {/* Доступ отделён заголовком, а не просто следующим полем: это
              не продолжение анкеты, а ключ от кабинета. */}
          <h3 className="mt-2 text-[13px] font-semibold" style={{ color: 'var(--muted)' }}>
            {t.settings.access}
          </h3>

          <label className="grid gap-1.5">
            <span className="label">{t.auth.phone}</span>
            <input
              className="field auth-field"
              name="phone"
              type="tel"
              inputMode="tel"
              placeholder="+374 77 123 456"
              required
              autoComplete="off"
            />
          </label>

          <label className="grid gap-1.5">
            <span className="label">
              {t.auth.pin} · {t.auth.pinHint}
            </span>
            <input
              className="field auth-field num !text-center !text-[19px] !font-semibold"
              name="pin"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              required
              autoComplete="off"
            />
          </label>

          <p className="note">{t.settings.staffNote}</p>

          <button className="btn mt-0.5" disabled={pending}>
            {pending ? t.common.loading : t.settings.addStaff}
          </button>

          {state?.error && <p className="alert">{state.error}</p>}
        </form>
      </Sheet>
    </>
  );
}
