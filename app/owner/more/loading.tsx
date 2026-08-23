import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonPanel } from '@/components/patterns/states';

/**
 * Что видно, пока едет «Ещё»: список разделов, а не данные. Строки
 * одной высоты и идут подряд, поэтому и мест столько же.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage className="mx-auto w-full max-w-3xl">
        <SkeletonHeader tools={false} />
        <SkeletonPanel rows={12} />
      </LoadingPage>
    </AfterDelay>
  );
}
