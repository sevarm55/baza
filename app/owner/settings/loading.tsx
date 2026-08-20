import { AfterDelay, SkeletonCard, SkeletonHead } from '@/components/loading';

/** Что видно, пока едут настройки бизнеса: два прибора, без чисел. */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <SkeletonCard className="h-[280px] lg:col-span-7" />
          <SkeletonCard className="h-[220px] lg:col-span-5" />
        </div>
      </div>
    </AfterDelay>
  );
}
