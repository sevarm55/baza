import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едет день.
 *
 * В день заходят с календаря и со сводки, то есть с уже открытым
 * кабинетом: оболочка на месте, меняется только рабочая область. Форма
 * та же, что у самого дня: плита прибыли, слагаемые рядом, смены слева
 * и лента записей справа.
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
          <div
            className="panel-pad rounded-[var(--radius-card)] lg:col-span-4"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-24" />
            </div>
            <SkeletonList rows={2} avatar />
          </div>

          <div
            className="panel-pad rounded-[var(--radius-card)] lg:col-span-8"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-28" />
            </div>
            <SkeletonList rows={6} />
          </div>
        </div>
      </div>
    </AfterDelay>
  );
}
