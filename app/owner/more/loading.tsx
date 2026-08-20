import { AfterDelay, SkeletonCard, SkeletonHead } from '@/components/loading';

/**
 * Что видно, пока едет «Ещё».
 *
 * Список разделов, а не данные. Строки здесь одной высоты и идут
 * подряд, поэтому и мест ровно столько же и такой же высоты.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />
        <div className="grid gap-2.5">
          {Array.from({ length: 7 }, (_, i) => (
            <SkeletonCard key={i} className="h-[58px]" />
          ))}
        </div>
      </div>
    </AfterDelay>
  );
}
