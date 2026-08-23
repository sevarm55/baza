import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from '@/components/patterns/states';

/** Что видно, пока едут абонементы: шапка, четыре показания и список. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={4} />
        <SkeletonTable rows={5} />
      </LoadingPage>
    </AfterDelay>
  );
}
