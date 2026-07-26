'use client';

import { useTransition } from 'react';
import { markPaid } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

export function PayButton({ staffId, label }: { staffId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="rounded-[10px] bg-accent px-3 py-1.5 text-[13px] font-semibold text-white disabled:opacity-50"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markPaid(staffId)))}
    >
      {pending ? hy.common.loading : label}
    </button>
  );
}
