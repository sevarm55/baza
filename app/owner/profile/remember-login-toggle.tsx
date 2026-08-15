'use client';

import { useState, useTransition } from 'react';
import { setRememberLogin } from '@/app/actions';
import { useT } from '@/lib/i18n/client';

/** Настройка этого браузера: без перезагрузки и без хранения токена в JS. */
export function RememberLoginToggle({ initial }: { initial: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !on;
    setOn(next);
    startTransition(async () => {
      try {
        await setRememberLogin(next);
      } catch {
        setOn(!next);
      }
    });
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={toggle}
      className="group flex w-full items-center justify-between gap-4 rounded-[var(--radius-sm)] bg-[color-mix(in_srgb,var(--board-ink)_5%,transparent)] px-3.5 py-3 text-start outline-none transition hover:bg-[color-mix(in_srgb,var(--board-ink)_8%,transparent)] focus-visible:ring-2 focus-visible:ring-[var(--accent)] disabled:opacity-70"
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-semibold" style={{ color: 'var(--on-board)' }}>
          {t.profile.rememberLogin}
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug" style={{ color: 'var(--board-muted)' }}>
          {t.profile.rememberLoginNote}
        </span>
      </span>

      <span
        className="relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200"
        style={{ background: on ? 'var(--accent2)' : 'color-mix(in srgb, var(--board-ink) 14%, transparent)' }}
        aria-hidden
      >
        <span
          className="absolute top-1 size-4 rounded-full bg-white shadow-sm transition-transform duration-200"
          style={{ transform: `translateX(${on ? '24px' : '4px'})` }}
        />
      </span>
    </button>
  );
}
