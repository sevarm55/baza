import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едут сотрудники.
 *
 * Плита долга, слагаемые рядом и список людей: у каждого лицо, имя и
 * процент. Поэтому в строках здесь стоят кружки аватаров, а не
 * квадратные значки, как в списках расходов и услуг: подставить круг на
 * место квадрата заметнее, чем не рисовать ничего.
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

        <div
          className="panel-pad mt-[var(--seam)] rounded-[var(--radius-card)]"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
          aria-hidden
        >
          <div className="mb-4">
            <SkeletonCard className="h-4 w-32" />
          </div>
          <SkeletonList rows={4} avatar />
        </div>
      </div>
    </AfterDelay>
  );
}
