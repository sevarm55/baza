import { AfterDelay, SkeletonCard, SkeletonHead } from '@/components/loading';

/**
 * Что видно, пока едет месяц.
 *
 * Одно большое поле в клетку. Раскладывать его на строки незачем:
 * календарь читается фигурой целиком, и место под него — прямоугольник
 * той же высоты, что и сам месяц.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead />
        <SkeletonCard className="h-[420px] lg:h-[520px]" />
      </div>
    </AfterDelay>
  );
}
