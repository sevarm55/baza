import { AfterDelay } from '@/components/loading';
import {
  LoadingPage,
  SkeletonHeader,
  SkeletonMetrics,
  SkeletonPanel,
  SkeletonTable,
} from '@/components/patterns/states';

/**
 * Что видно, пока считается отчёт: по форме настоящей страницы.
 *
 * Отчёт считается дольше остальных разделов, он поднимает историю за
 * полгода целиком, поэтому скелет здесь особенно важен: шапка с
 * переключателем месяцев, полоса показаний, график с пропорцией, три
 * разреза в ряд, люди и таблица месяцев.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <SkeletonMetrics count={4} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel className="h-[300px] lg:col-span-8" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonPanel rows={3} className="lg:col-span-4" />
          <SkeletonTable rows={5} className="lg:col-span-8" />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
