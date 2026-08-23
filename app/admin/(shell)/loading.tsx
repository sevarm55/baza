import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from '@/components/patterns/states';

export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <SkeletonMetrics count={6} />
        <SkeletonTable rows={8} />
      </LoadingPage>
    </AfterDelay>
  );
}
