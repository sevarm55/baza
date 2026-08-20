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
            <SkeletonCard className="h-[200px]" />
            <SkeletonCard className="h-[240px]" />
            <SkeletonCard className="h-[160px]" />
          </div>
          <div className="grid gap-[var(--seam)] lg:col-span-5">
            <SkeletonCard className="h-[180px]" />
            <SkeletonCard className="h-[200px]" />
          </div>
        </div>
      </div>
    </AfterDelay>
  );
}
