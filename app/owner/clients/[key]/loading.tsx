import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едет карточка машины.
 *
 * Плита пожизненной суммы, слагаемые рядом, привычки слева и история
 * визитов справа. Скелет списка клиентов здесь не годится: это уже не
 * список, а одна машина.
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
          <SkeletonCard className="h-[220px] lg:col-span-5" />
          <div
            className="panel-pad rounded-[var(--radius-card)] lg:col-span-7"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-36" />
            </div>
            <SkeletonList rows={5} />
          </div>
        </div>
      </div>
    </AfterDelay>
  );
}
