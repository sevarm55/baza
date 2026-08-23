import { AfterDelay } from '@/components/loading';
import {
  LoadingPage,
  SkeletonHeader,
  SkeletonMetrics,
  SkeletonPanel,
} from '@/components/patterns/states';

/**
 * Что видно, пока едут расходы: по форме настоящей страницы.
 *
 * Шапка с кнопкой, полоса из четырёх показаний и два списка рядом:
 * постоянные расходы уже, разовые по дням шире. Разметка не
 * перекладывается, когда приезжают данные.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonMetrics count={4} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel rows={3} className="lg:col-span-5" />
          <SkeletonPanel rows={5} className="lg:col-span-7" />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
