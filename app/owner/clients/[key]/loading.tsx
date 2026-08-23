import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel, SkeletonTable } from '@/components/patterns/states';

/**
 * Что видно, пока едет карточка машины: шапка с кнопками связи, полоса
 * из трёх показаний, привычки слева и история визитов справа.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={3} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel rows={4} className="lg:col-span-4" />
          <SkeletonTable rows={5} className="lg:col-span-8" />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
