'use client';

import { useActionState, useState } from 'react';
import { resumeSavedAccount, signIn, type FormState } from '@/app/actions';
import { PinInput } from '@/components/pin-input';
import { personColor } from '@/lib/person-color';
import type { RememberedWebAccount } from '@/lib/auth';
import { hy } from '@/lib/i18n/hy';

export function LoginForm({ remembered = null }: { remembered?: RememberedWebAccount | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(signIn, null);
  const [resumeState, resumeAction, resuming] = useActionState<FormState, FormData>(
    resumeSavedAccount,
    null,
  );
  const [manual, setManual] = useState(!remembered);

  if (remembered && !manual && !resumeState?.error) {
    const initial = remembered.name.trim().slice(0, 1).toUpperCase();
    const color = personColor(remembered.name);

    return (
      <div className="grid justify-items-center gap-4 text-center">
        <p className="text-[13px] font-semibold tracking-[0.08em] text-muted uppercase">
          {hy.auth.welcomeBack}
        </p>

        <form action={resumeAction}>
          <button
            className="group relative grid size-24 place-items-center rounded-full text-[34px] font-bold text-white outline-none transition duration-200 hover:scale-[1.035] active:scale-[0.97] focus-visible:ring-4 focus-visible:ring-[color-mix(in_srgb,var(--accent)_32%,transparent)] disabled:opacity-60"
            style={{
              background: color,
              boxShadow: `0 18px 42px color-mix(in srgb, ${color} 28%, transparent)`,
            }}
            aria-label={`${hy.auth.signIn}՝ ${remembered.name}`}
            disabled={resuming}
          >
            {resuming ? (
              <span className="size-6 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden />
            ) : (
              initial
            )}
            <span className="absolute inset-1 rounded-full border border-white/20" aria-hidden />
          </button>
        </form>

        <div>
          <div className="text-[20px] leading-tight font-bold">{remembered.name}</div>
          <div className="mt-1 text-[13.5px] text-muted">{remembered.tenant}</div>
        </div>

        <p className="text-[12.5px] text-muted">{hy.auth.tapAvatar}</p>

        <button
          type="button"
          className="text-[13.5px] font-semibold text-muted underline decoration-current/30 underline-offset-4 transition hover:text-ink"
          onClick={() => setManual(true)}
        >
          {hy.auth.anotherAccount}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-2">
        <span className="label">{hy.auth.phone}</span>
        <div className="relative">
          {/* Код страны нарисован в поле, а не набирается: клиенты все
              местные, и восемь лишних нажатий каждый раз — это налог
              на вход, который платят зря. */}
          <span className="num pointer-events-none absolute inset-y-0 start-4 flex items-center text-[16px] text-faint">
            +374
          </span>
          <input
            className="field auth-field num !ps-[4.4rem] !text-[16px]"
            name="phone"
            type="tel"
            inputMode="tel"
            placeholder="77 123 456"
            required
            /* без autoFocus: на телефоне он тут же выбрасывает клавиатуру
               и подбрасывает вёрстку, а человек ещё не решил, входит он
               или регистрируется */
            autoComplete="username"
          />
        </div>
      </label>

      <label className="grid gap-2">
        <span className="label">{hy.auth.pin}</span>
        <PinInput />
      </label>

      {(state?.error || resumeState?.error) && (
        <p className="alert">{state?.error ?? resumeState?.error}</p>
      )}

      <button className="btn mt-1" disabled={pending}>
        {pending ? hy.common.loading : hy.auth.signIn}
      </button>
    </form>
  );
}
