import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/** Что видно, пока едут абонементы: список слева, продажа справа. */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <div
            className="panel-pad rounded-[var(--radius-card)] lg:col-span-8"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-32" />
            </div>
            <SkeletonList rows={4} />
          </div>
          <SkeletonCard className="h-[300px] lg:col-span-4" />
        </div>
      </div>
    </AfterDelay>
  );
}
