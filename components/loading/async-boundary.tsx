'use client';

import type { ReactNode } from 'react';

import { ErrorState } from '@/components/patterns/error-state';
import { useDelayedFlag } from './use-delayed';

/**
 * Четыре разных ответа на один вопрос «что показывать».
 *
 *   loading  →  скелет по форме этой секции
 *   error    →  что не вышло и кнопка «Повторить»
 *   empty    →  что это за список и откуда в нём берутся строки
 *   data     →  содержимое
 *
 * `refreshing` ничего не заменяет: данные уже на экране, идёт сверка.
 */
export function AsyncBoundary({
  loading,
  refreshing = false,
  error,
  empty = false,
  skeleton,
  emptyState,
  errorTitle,
  onRetry,
  children,
}: {
  loading: boolean;
  refreshing?: boolean;
  error?: unknown;
  empty?: boolean;
  skeleton: ReactNode;
  emptyState: ReactNode;
  errorTitle?: string;
  onRetry?: () => void | Promise<void>;
  children: ReactNode;
}) {
  const showSkeleton = useDelayedFlag(loading);

  if (error) {
    return (
      <ErrorState
        compact
        title={errorTitle}
        description={error instanceof Error ? error.message || undefined : undefined}
        onRetry={onRetry}
      />
    );
  }

  if (loading) return showSkeleton ? <div aria-busy="true">{skeleton}</div> : null;
  if (empty) return <>{emptyState}</>;

  return (
    <div className="page-enter" aria-busy={refreshing || undefined}>
      {children}
    </div>
  );
}
