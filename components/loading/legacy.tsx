'use client';

/* ВРЕМЕННАЯ прослойка на время пересборки: старые имена загрузчиков,
   чтобы не переписанные ещё страницы компилировались. Удалить вместе с
   последней старой страницей. */

import type { ReactNode } from 'react';

import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { ErrorState } from '@/components/patterns/error-state';
import { SkeletonHeader, SkeletonTable } from '@/components/patterns/states';

export function SkeletonCard({ className = '', children }: { className?: string; style?: unknown; children?: ReactNode }) {
  return <Skeleton className={className}>{children}</Skeleton>;
}
export function SkeletonText({ className = '' }: { className?: string; style?: unknown }) {
  return <Skeleton className={className} />;
}
export function SkeletonAvatar({ className = 'size-9' }: { className?: string }) {
  return <Skeleton className={`rounded-full ${className}`} />;
}
export function SkeletonRow() {
  return <Skeleton className="h-4 w-full" />;
}
export function SkeletonList({ rows = 4 }: { rows?: number; avatar?: boolean }) {
  return <SkeletonTable rows={rows} />;
}
export { SkeletonTable, SkeletonHeader as SkeletonHead };
export function PageSkeleton() {
  return <SkeletonTable rows={3} />;
}
export function AsyncError(props: { title?: string; note?: string; onRetry?: () => void | Promise<void> }) {
  return <ErrorState title={props.title} description={props.note} onRetry={props.onRetry} />;
}
export function TetrinMiniLoader({ className = '' }: { className?: string }) {
  return <Spinner className={className} />;
}
export function TetrinLoader({ className = '' }: { size?: number; tone?: string; className?: string; label?: string }) {
  return <Spinner className={className} />;
}
export function FullScreenLoader() {
  return null;
}
