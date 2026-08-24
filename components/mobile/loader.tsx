import { cn } from '@/lib/utils';

/**
 * Фирменный загрузчик — четыре столбика.
 *
 * Пока приложение думает, оно показывает ту же фигуру, которой
 * показывает деньги: столбики стоят в графике дня, в профиле недели, в
 * значке вкладки. Это единственная причина, по которой загрузчик здесь
 * свой, а не системный кружок.
 *
 * Оборот, кривые и опорные кадры — те же, что в
 * `ios/Tetr/Design/Theme.swift`. Числа стоят рядом в обоих местах и
 * правятся вместе; разъехаться им негде.
 */
export function TetrinLoader({
  size = 22,
  className,
  label,
}: {
  /** высота фигуры в пикселях; ширина считается от неё */
  size?: number;
  className?: string;
  /** подпись для читалки экрана на языке интерфейса */
  label?: string;
}) {
  return (
    <span
      className={cn('tl', className)}
      style={{ fontSize: `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

/**
 * Малый загрузчик: три столбика волной.
 *
 * Внутри кнопок и строк. Морфа здесь нет намеренно — см. комментарий
 * к `.tl-mini` в `globals.css`.
 */
export function TetrinMiniLoader({
  size = 16,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={cn('tl-mini', className)}
      style={{ fontSize: `${size}px` }}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <i />
      <i />
      <i />
    </span>
  );
}
