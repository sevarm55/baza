import { AfterDelay } from '@/components/loading';
import { DesktopOnly, MBone, MobileOnly } from '@/components/mobile';
import { LoadingPage, SkeletonPanel } from '@/components/patterns/states';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Что видно, пока едет смена.
 *
 * Пустота между нажатием и числами читается как «приложение не
 * открылось», а не как «сейчас будет». Место под содержимое повторяет
 * его форму: табло с главным числом сверху, крупная кнопка записи и
 * журнал под ней.
 */
export default function Loading() {
  return (
    <AfterDelay>
      {/* Поле на телефоне даёт оболочка; здесь оно только для
          компьютера, иначе отступ удваивается. */}
      <div className="mx-auto w-full max-w-3xl px-4 py-5 max-md:px-0 max-md:py-0 md:px-6">
        {/* На телефоне место повторяет форму экрана смены: приветствие,
            крупное число, фишка состояния, две плитки, кнопка, журнал. */}
        <MobileOnly className="flex flex-col gap-3" aria-hidden>
          <MBone height={20} width="45%" />
          <div className="flex flex-col gap-2">
            <MBone height={16} width="35%" />
            <MBone height={48} width="65%" />
          </div>
          <MBone height={40} width={200} radius="full" />
          <div className="grid grid-cols-2 gap-2.5">
            <MBone height={116} radius="tile" />
            <MBone height={116} radius="tile" />
          </div>
          <MBone height={52} radius="tile" />
          <MBone height={70} radius="tile" />
          <MBone height={70} radius="tile" />
        </MobileOnly>

        <DesktopOnly>
        <LoadingPage>
          {/* Табло смены: подпись, большое число, строка состояния. */}
          <div className="rounded-lg border border-border bg-card p-4" aria-hidden>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
              <div className="flex flex-col gap-3">
                <Skeleton className="h-2.5 w-28" />
                <Skeleton className="h-7 w-40" />
                <Skeleton className="h-5 w-32 rounded-md" />
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-6">
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-5 w-10" />
                </div>
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-2.5 w-20" />
                  <Skeleton className="h-5 w-24" />
                </div>
              </div>
            </div>
          </div>

          {/* Кнопка записи: её ищут глазами первой, и место под неё
              обязано стоять там же. */}
          <Skeleton className="h-12 w-full rounded-lg" aria-hidden />

          <SkeletonPanel rows={4} />
        </LoadingPage>
        </DesktopOnly>
      </div>
    </AfterDelay>
  );
}
