import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едут расходы.
 *
 * Раздел до сих пор ждал под скелетом сводки: график выручки во всю
 * ширину и три прибора справа, за которыми появлялись плита итога и
 * два списка. Разметка перекладывалась на глазах, и это читалось как
 * сбой отрисовки, а не как загрузка.
 *
 * Здесь форма своя: шапка с переключателем месяца, плита потраченного,
 * слагаемые рядом и два прибора списков — постоянные расходы и разовые
 * по дням.
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
          <Panel rows={3} className="lg:col-span-5" />
          <Panel rows={5} className="lg:col-span-7" />
        </div>
      </div>
    </AfterDelay>
  );
}

function Panel({ rows, className = '' }: { rows: number; className?: string }) {
  return (
    <div
      className={`panel-pad rounded-[var(--radius-card)] ${className}`}
      style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
      aria-hidden
    >
      <div className="mb-4">
        <SkeletonCard className="h-4 w-36" />
      </div>
      <SkeletonList rows={rows} />
    </div>
  );
}
