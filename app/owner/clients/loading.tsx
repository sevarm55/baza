import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList, SkeletonText } from '@/components/loading';

/**
 * Что видно, пока едет база клиентов.
 *
 * Плита пожизненной суммы, слагаемые рядом, под ними жёлоб вкладок
 * («в базе», «постоянные», «давно не были») и длинный список машин.
 * Список — то, ради чего раздел открывают, и мест под строки здесь
 * больше, чем в остальных разделах.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
          <SkeletonCard className="h-[136px]" />
          <SkeletonCard className="h-[136px]" />
        </div>

        <div
          className="panel-pad mt-[var(--seam)] rounded-[var(--radius-card)]"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
          aria-hidden
        >
          <div className="mb-4 flex flex-wrap items-center gap-2.5">
            <SkeletonText className="h-8 w-[260px] !rounded-[8px]" />
            <SkeletonText className="ms-auto h-8 w-[180px] !rounded-[8px]" />
          </div>
          <SkeletonList rows={7} />
        </div>
      </div>
    </AfterDelay>
  );
}
