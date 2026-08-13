'use client';

import { useState } from 'react';
import { AuthDialog, type AuthMode } from '@/components/auth-dialog';
import type { RememberedWebAccount } from '@/lib/auth';

/**
 * Кнопки лендинга, открывающие окно входа.
 *
 * Лендинг остаётся серверным: клиентским становится только то, что
 * действительно нажимают. Кнопок на странице несколько — в шапке, на
 * первом экране и у цены, — и все они открывают одно и то же окно;
 * держать его в одном месте дешевле, чем по копии на кнопку.
 */
export function AuthTrigger({
  mode,
  niche,
  className,
  children,
  remembered,
}: {
  mode: AuthMode;
  niche: string;
  className?: string;
  children: React.ReactNode;
  remembered?: RememberedWebAccount | null;
}) {
  const [open, setOpen] = useState<AuthMode | null>(null);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(mode)}>
        {children}
      </button>
      <AuthDialog
        key={open ?? 'closed'}
        mode={open}
        niche={niche}
        remembered={remembered}
        onClose={() => setOpen(null)}
      />
    </>
  );
}
