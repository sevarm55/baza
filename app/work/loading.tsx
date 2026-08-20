import { AfterDelay, SkeletonCard, SkeletonList } from '@/components/loading';

/**
 * Что видно, пока едет смена.
 *
 * Экран мойщика открывают сорок раз за смену, часто с телефона в
 * подвале, и до сих пор в этот момент не было ничего: пустое полотно,
 * потом сразу цифры. Пустота между нажатием и числами читается как
 * «приложение не открылось», а не как «сейчас будет».
 *
 * Заслонки на весь экран здесь быть не может: шапка со сменой и нижние
 * вкладки уже нарисованы и уже нажимаются. Меняется только рабочая
 * область, и место под неё повторяет её форму: главное число сверху,
 * две плитки под ним, крупная кнопка записи и журнал.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div className="mx-auto grid w-full max-w-[46rem] gap-[var(--seam)]" aria-busy="true" aria-live="polite">
        <div className="grid content-start gap-[var(--seam)]">
          {/* Главное число смены. Высота та же, что у настоящего прибора,
              иначе кнопка записи прыгнет вверх при подстановке. */}
          <SkeletonCard className="h-[124px]" />

          <div className="grid grid-cols-2 gap-[var(--seam)]">
            <SkeletonCard className="h-[104px]" />
            <SkeletonCard className="h-[104px]" />
          </div>

          {/* Кнопка записи: та же высота, что у `.btn-big`. Её ищут
              глазами первой, и место под неё обязано стоять там же. */}
          <SkeletonCard className="h-[60px] !rounded-[var(--radius-card)]" />

          <div
            className="panel-pad rounded-[var(--radius-card)]"
            style={{ background: 'color-mix(in srgb, var(--board-ink) 4%, transparent)' }}
            aria-hidden
          >
            <div className="mb-4">
              <SkeletonCard className="h-4 w-32" />
            </div>
            <SkeletonList rows={4} />
          </div>
        </div>
      </div>
    </AfterDelay>
  );
}
