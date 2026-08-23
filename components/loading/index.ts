/**
 * Состояния ожидания — из одного места.
 *
 *   B · страница     *_/loading.tsx_    скелет по форме именно этой страницы
 *   C · часть        AsyncBoundary      секция ждёт, остальная страница жива
 *   D · действие     LoadingButton      нажали, идёт
 *   E · фон          RefreshIndicator   данные есть, идёт сверка
 */

export { LoadingButton } from './loading-button';
export { RefreshIndicator } from './refresh-indicator';
export { AsyncBoundary } from './async-boundary';
export { OfflineBar } from './offline-bar';
export { PageFade } from './page-fade';
export { AfterDelay } from './after-delay';
export { useAsyncAction, type AsyncStatus } from './use-async-action';
export { useDelayedFlag, useLongWait, useAlive } from './use-delayed';
