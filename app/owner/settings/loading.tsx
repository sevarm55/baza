import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonPanel } from '@/components/patterns/states';
import { Skeleton } from '@/components/ui/skeleton';

/** Что видно, пока едут настройки бизнеса: оглавление и три панели без чисел. */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader tools={false} />
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
          <div className="hidden shrink-0 flex-col gap-3 lg:flex lg:w-48" aria-hidden>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="mx-2 h-3 w-24" />
            ))}
          </div>
          <div className="flex max-w-3xl flex-1 flex-col gap-4">
            <SkeletonPanel rows={3} />
            <SkeletonPanel className="h-32" />
            <SkeletonPanel className="h-16" />
          </div>
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
