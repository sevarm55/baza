'use client';

import type { ReactNode } from 'react';

import { AsyncError } from './async-error';
import { useDelayedFlag } from './use-delayed';

/**
 * Четыре разных ответа на один вопрос «что показывать».
 *
 * Пустой массив и «ещё не приехало» — не одно и то же, и путать их
 * нельзя: раздел, который на успешный пустой ответ показывает вечный
 * загрузчик, выглядит сломанным, а раздел, который на незагруженные
 * данные пишет «расходов пока нет», врёт.
 *
 *   loading  →  скелет по форме этой страницы
 *   error    →  что не вышло и кнопка «Повторить»
 *   empty    →  что это за список и откуда в нём берутся строки
 *   data     →  содержимое
 *
 * Пятое состояние — `refreshing` — не заменяет содержимое ничем. Данные
 * уже на экране, идёт сверка; она права на экран не имеет.
 *
 * Компонент нарочно ничего не знает про то, откуда берутся данные: в
 * кабинете их приносит сервер через `page.tsx`, в списках — серверные
 * действия, в мойщике — очередь в localStorage. Переписывать все
 * запросы ради общего вида было бы дороже, чем польза от него.
 */
export function AsyncBoundary({
  loading,
  refreshing = false,
  error,
  empty = false,
  skeleton,
  emptyState,
  errorTitle,
  onRetry,
  children,
}: {
  loading: boolean;
  /** данные есть, идёт сверка: содержимое остаётся на месте */
  refreshing?: boolean;
  /**
   * Что не вышло. Годится и `Error`, и просто признак отказа: половина
   * запросов в кабинете приходит серверным действием, и объекта ошибки
   * у них на руках нет — есть только «не получилось».
   */
  error?: unknown;
  empty?: boolean;
  skeleton: ReactNode;
  emptyState: ReactNode;
  errorTitle?: string;
  onRetry?: () => void | Promise<void>;
  children: ReactNode;
}) {
  /* Быстрый ответ не должен успевать мигнуть скелетом. Порог только на
     показ загрузки: готовые данные никогда не придерживаются. */
  const showSkeleton = useDelayedFlag(loading);

  if (error) {
    return (
      <AsyncError
        title={errorTitle}
        note={error instanceof Error ? error.message || undefined : undefined}
        onRetry={onRetry}
      />
    );
  }

  if (loading) return showSkeleton ? <div aria-busy="true">{skeleton}</div> : null;
  if (empty) return <>{emptyState}</>;

  return (
    <div className="async-in" aria-busy={refreshing || undefined}>
      {children}
    </div>
  );
}
