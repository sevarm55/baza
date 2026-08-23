import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonTable } from '@/components/patterns/states';

/**
 * Что видно, пока едут сотрудники: шапка с кнопками, полоса из трёх
 * показаний и список людей той же геометрии, что настоящий.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={3} />
        <SkeletonTable rows={5} />
      </LoadingPage>
    </AfterDelay>
  );
}
