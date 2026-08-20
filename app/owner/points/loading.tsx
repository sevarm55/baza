import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/** Что видно, пока едут филиалы: список слева, форма новой точки справа. */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <div
            className="panel-pad rounded-[var(--radius-card)] lg:col-span-7"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-28" />
            </div>
            <SkeletonList rows={3} />
          </div>
          <SkeletonCard className="h-[240px] lg:col-span-5" />
        </div>
      </div>
    </AfterDelay>
  );
}
