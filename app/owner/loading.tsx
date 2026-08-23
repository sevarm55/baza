import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel, SkeletonTable } from '@/components/patterns/states';

/** Что видно, пока едет сводка: по форме настоящей страницы. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={4} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel className="h-[300px] lg:col-span-8" />
          <div className="flex flex-col gap-4 lg:col-span-4">
            <SkeletonPanel rows={3} />
            <SkeletonPanel rows={2} />
          </div>
        </div>
        <SkeletonTable rows={6} />
      </LoadingPage>
    </AfterDelay>
  );
}
