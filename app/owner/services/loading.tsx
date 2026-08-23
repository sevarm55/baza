import { AfterDelay } from '@/components/loading';
import { LoadingPage, SkeletonHeader, SkeletonTable } from '@/components/patterns/states';

/**
 * Что видно, пока едет прайс: шапка с кнопками и список услуг. Полосы
 * показаний здесь нет: страница начинается сразу со списка, и скелет с
 * плитами обещал бы числа, которых на этой странице не будет.
 */
export default function Loading() {
  return (
    <AfterDelay>
      <LoadingPage>
        <SkeletonHeader />
        <SkeletonTable rows={6} />
      </LoadingPage>
    </AfterDelay>
  );
}
