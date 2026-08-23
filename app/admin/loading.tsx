import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel } from '@/components/patterns/states';

/** Что видно, пока едут данные админки. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <SkeletonMetrics count={4} />
        <SkeletonPanel rows={4} />
        <SkeletonPanel rows={4} />
      </LoadingPage>
    </AfterDelay>
  );
}
