import { AfterDelay } from '@/components/loading';
import { Skeleton } from '@/components/ui/skeleton';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from '@/components/patterns/states';

/**
 * Что видно, пока едет база клиентов: шапка без кнопок, полоса из
 * четырёх показаний, ряд инструментов (поиск, группы, порядок) и длинный
 * список машин. Список — то, ради чего раздел открывают, и мест под
 * строки здесь больше, чем в остальных разделах.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <SkeletonMetrics count={4} />
        <div className="flex flex-wrap items-center gap-2" aria-hidden>
          <Skeleton className="h-9 w-full sm:w-64" />
          <Skeleton className="h-9 w-72" />
          <Skeleton className="h-9 w-36" />
        </div>
        <SkeletonTable rows={7} />
      </LoadingPage>
    </AfterDelay>
  );
}
