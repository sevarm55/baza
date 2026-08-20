import { AfterDelay, SkeletonCard, SkeletonHead } from '@/components/loading';

/**
 * Что видно, пока едет профиль.
 *
 * Страница целиком собрана из приборов-настроек разной высоты, и
 * никаких чисел на ней нет. Скелет сводки с плитой выручки наверху
 * обещал бы здесь ровно то, чего не будет.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <div aria-busy="true" aria-live="polite">
        <SkeletonHead tools={false} />

        <div className="grid gap-[var(--seam)] lg:grid-cols-12">
          <div className="grid gap-[var(--seam)] lg:col-span-7">
            <SkeletonCard className="h-[230px]" />
            <SkeletonCard className="h-[300px]" />
          </div>
          <div className="grid gap-[var(--seam)] lg:col-span-5">
            <SkeletonCard className="h-[148px]" />
            <SkeletonCard className="h-[132px]" />
            <SkeletonCard className="h-[142px]" />
            <SkeletonCard className="h-[172px]" />
            <SkeletonCard className="h-[126px]" />
          </div>
        </div>
      </div>
    </AfterDelay>
  );
}
