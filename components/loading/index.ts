/**
 * Состояния ожидания — из одного места.
 *
 * До этого набора каждая страница решала заново, что показать между
 * нажатием и ответом, и решала по-разному: где-то кнопка гасла, где-то
 * подпись менялась на «Загрузка…», где-то не происходило ничего. Пять
 * уровней ожидания, которые нельзя смешивать:
 *
 *   A · приложение   FullScreenLoader   только запуск и восстановление сессии
 *   B · страница     *_/loading.tsx_    скелет по форме именно этой страницы
 *   C · часть        AsyncBoundary      прибор ждёт, остальная страница жива
 *   D · действие     LoadingButton      нажали, идёт
 *   E · фон          RefreshIndicator   данные есть, идёт сверка
 */

export { TetrinLoader } from './tetrin-loader';
export { TetrinMiniLoader } from './tetrin-mini-loader';
export { FullScreenLoader } from './full-screen-loader';
export { LoadingButton } from './loading-button';
export { RefreshIndicator } from './refresh-indicator';
export { AsyncError } from './async-error';
export { AsyncBoundary } from './async-boundary';
export { OfflineBar } from './offline-bar';
export { PageFade } from './page-fade';
export { AfterDelay } from './after-delay';
export {
  SkeletonCard,
  SkeletonText,
  SkeletonAvatar,
  SkeletonRow,
  SkeletonList,
  SkeletonTable,
  SkeletonHead,
  PageSkeleton,
} from './skeleton';
export { useAsyncAction, type AsyncStatus } from './use-async-action';
export { useDelayedFlag, useLongWait, useAlive } from './use-delayed';
