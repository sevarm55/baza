import { AfterDelay, SkeletonCard, SkeletonHead, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едет прайс.
 *
 * Плиты итога здесь нет вовсе: страница начинается сразу со списка
 * услуг с ценами. Скелет со сводочной плитой наверху обещал бы число,
 * которого на этой странице не будет.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead />

        <div
          className="panel-pad rounded-[var(--radius-card)]"
          style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
          aria-hidden
        >
          <div className="mb-4">
            <SkeletonCard className="h-4 w-40" />
          </div>
          <SkeletonList rows={6} />
        </div>
      </div>
    </AfterDelay>
  );
}
