'use client';

import { RotateCw } from 'lucide-react';

import { useT } from '@/lib/i18n/client';
import { LoadingButton } from './loading-button';
import { useAsyncAction } from './use-async-action';

/**
 * Отказ, который остался внутри своего прибора.
 *
 * Если не приехал график, остальные восемь чисел на щите верны, и
 * убирать их ради сообщения о девятом значит потерять больше, чем
 * сообщить. Поэтому ошибка одного виджета живёт в этом виджете и
 * выглядит как его содержимое, а не как авария страницы.
 *
 * Кнопка «Повторить» — не ссылка на перезагрузку. Она сама переходит в
 * занятое состояние и, если второй заход тоже не удался, остаётся на
 * месте: человек должен видеть, что попытка была и что она кончилась,
 * а не гадать, нажалась ли кнопка.
 */
export function AsyncError({
  title,
  note,
  onRetry,
}: {
  /** «Не удалось загрузить расходы» — что именно не приехало */
  title?: string;
  /** одно предложение о причине, если она известна точнее «не вышло» */
  note?: string;
  /** пусто — повторять нечего, и кнопки не будет */
  onRetry?: () => void | Promise<void>;
}) {
  const t = useT();
  const retry = useAsyncAction(async () => {
    await onRetry?.();
  });

  return (
    <div className="async-error" role="alert">
      <p className="async-error-title">{title ?? t.common.loadFailed}</p>
      {note && <p className="async-error-note">{note}</p>}
      {onRetry && (
        <LoadingButton
          type="button"
          className="btn-inline"
          busy={retry.running}
          icon={<RotateCw className="size-3.5" aria-hidden />}
          label={t.common.retry}
          busyLabel={t.common.retrying}
          onClick={() => retry.run()}
        />
      )}
    </div>
  );
}
