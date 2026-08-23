'use client';

import { Spinner } from '@/components/ui/spinner';
import { useDelayedFlag } from './use-delayed';

/**
 * Точка рядом с заголовком: данные на экране сверяются с сервером.
 * Содержимое остаётся на месте; только кто ждал обновления, заметит её.
 */
export function RefreshIndicator({ active, label }: { active: boolean; label?: string }) {
  const show = useDelayedFlag(active);
  if (!show) return null;
  return <Spinner className="size-3.5 text-muted-foreground" aria-label={label} />;
}
