import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonMetrics, SkeletonPanel } from '@/components/patterns/states';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Что видно, пока едут зарплаты: по форме настоящей страницы.
 *
 * Сверху шапка и полоса из четырёх показаний, под ней переключатель и
 * панели рабочих дней со строками людей. Скелет, который показывает не
 * ту разметку, читается как «страница загрузилась неправильно», и
 * вздрагивание при подстановке настоящего содержимого заметнее, чем его
 * отсутствие.
 *
 * Строк ровно столько, сколько бывает в дне на маленькой мойке: два-три
 * человека. Пустых мест больше, чем данных, не рисуем, иначе после
 * загрузки страница схлопывается.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage className="gap-5">
        <SkeletonHeader tools={false} />
        <SkeletonMetrics count={4} />
        <div className="flex flex-col gap-4">
          <Skeleton className="h-9 w-56 rounded-lg" aria-hidden />
          <SkeletonPanel rows={3} />
          <SkeletonPanel rows={3} />
        </div>
      </LoadingPage>
    </AfterDelay>
  );
}
