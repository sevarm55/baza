'use client';

import { useTransition } from 'react';
import { markPaid } from '@/app/actions';
import { hy } from '@/lib/i18n/hy';

/**
 * «Выплачено» на плитке человека.
 *
 * Кнопка стоит на цветной заливке, и общие тона ей не годятся: лайм на
 * бирюзовом спорит сам с собой, а серая плашка страницы читается
 * наклейкой поверх плитки. Здесь заливка белая, а текст — чернила
 * плитки: третьего цвета не заводим, контраст максимальный.
 */
export function PayButton({ staffId, label }: { staffId: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      className="inline-flex items-center rounded-[var(--radius-chip)] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#14121a] transition-[background,transform] duration-150 hover:bg-white/85 active:translate-y-px disabled:opacity-50"
      disabled={pending}
      onClick={() => startTransition(async () => void (await markPaid(staffId)))}
    >
      {pending ? hy.common.loading : label}
    </button>
  );
}
