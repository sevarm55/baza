import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel, SkeletonTable } from '@/components/patterns/states';

/** Что видно, пока едет день: по форме настоящей страницы. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={4} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel rows={2} className="lg:col-span-4" />
          <div className="lg:col-span-8">
            <SkeletonTable rows={6} />
          </div>
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
