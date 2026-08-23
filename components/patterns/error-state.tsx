'use client';

import { RotateCw } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n/client';
import { cn } from '@/lib/utils';

/**
 * Локальная ошибка: называет, что именно не приехало, и даёт повторить.
 *
 * Живёт внутри той секции, которая не загрузилась; остальная страница
 * продолжает работать. Без кода ошибки: владельцу он ничего не скажет.
 */
export function ErrorState({
  title,
  description,
  onRetry,
  retryLabel,
  busy = false,
  className,
  compact = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  onRetry?: () => void | Promise<void>;
  retryLabel?: string;
  busy?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const t = useT();
  return (
    <div
      role="alert"
      className={cn(
        'flex w-full flex-col items-center justify-center text-center',
        compact ? 'gap-2 px-4 py-8' : 'gap-3 rounded-lg border border-dashed border-border px-6 py-10',
        className,
      )}
    >
      <div className="flex max-w-sm flex-col gap-1">
        <div className="text-sm font-semibold">{title ?? t.common.loadFailed}</div>
        {description && <div className="text-sm text-muted-foreground">{description}</div>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={() => void onRetry()} disabled={busy}>
          <RotateCw data-icon="inline-start" className={cn(busy && 'animate-spin')} />
          {retryLabel ?? t.common.retry}
        </Button>
      )}
    </div>
  );
}
