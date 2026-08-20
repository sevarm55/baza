import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едет «Ещё».
 *
 * Список разделов, а не данные. Строки здесь одной высоты и идут
 * подряд, поэтому и мест ровно столько же и такой же высоты.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div className="mx-auto w-full max-w-[46rem]" aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />
        <div className="more-grid">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} className="h-[108px]" />
          ))}
        </div>
        <div className="rows mt-[var(--seam)] px-1" aria-hidden>
          <SkeletonList rows={3} />
        </div>
      </div>
    </AfterDelay>
  );
}
