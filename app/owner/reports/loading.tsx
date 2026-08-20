import { AfterDelay, SkeletonCard, SkeletonHead } from '@/components/loading';

/**
 * Что видно, пока считается отчёт.
 *
 * Отчёт считается дольше остальных разделов: он поднимает историю за
 * период целиком. Поэтому скелет здесь особенно важен, а форма у него
 * своя: полосы сравнения, а не список строк.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead />

        <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <SkeletonCard className="h-[136px]" />
          <SkeletonCard className="h-[136px]" />
        </div>

        <div className="mt-[var(--seam)] grid gap-[var(--seam)] lg:grid-cols-12">
          <SkeletonCard className="h-[260px] lg:col-span-6" />
          <SkeletonCard className="h-[260px] lg:col-span-6" />
          <SkeletonCard className="h-[260px] lg:col-span-12" />
        </div>
      </div>
    </AfterDelay>
  );
}
