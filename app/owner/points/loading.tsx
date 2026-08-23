import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonPanel } from '@/components/patterns/states';

/** Что видно, пока едут филиалы: список слева, форма новой точки справа. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <div className="grid gap-4 lg:grid-cols-12">
          <SkeletonPanel rows={3} className="lg:col-span-7" />
          <SkeletonPanel className="h-[240px] lg:col-span-5" />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
