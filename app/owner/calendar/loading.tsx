import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel } from '@/components/patterns/states';

/**
 * Что видно, пока едет месяц: шапка с переходом по месяцам, полоса
 * итогов и одно большое поле в клетку той же высоты, что сам месяц.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={3} />
        <SkeletonPanel className="h-[440px] lg:h-[560px]" />
      </LoadingPage>
    </AfterDelay>
  );
}
