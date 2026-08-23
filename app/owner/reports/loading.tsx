import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel, SkeletonTable } from '@/components/patterns/states';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Что видно, пока считается отчёт: по форме настоящей страницы.
 * Шапка с панелью инструментов, шесть показаний, динамика с кольцом,
 * два графика и две таблицы: форма обзора, самой частой вкладки.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <div className="flex flex-col gap-3" aria-hidden>
          <div className="flex gap-2">
            <Skeleton className="h-8 w-72" />
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-9 w-80" />
        </div>
        <SkeletonMetrics count={6} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel className="h-[340px] lg:col-span-8" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonPanel className="h-[280px] lg:col-span-6" />
          <SkeletonPanel className="h-[280px] lg:col-span-6" />
          <SkeletonTable rows={5} className="lg:col-span-6" />
          <SkeletonTable rows={5} className="lg:col-span-6" />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
