import type { CSSProperties } from 'react';

/**
 * Круговой индикатор для тех редких состояний, где ещё нечего показать
 * скелетом: запуск, восстановление сессии и проверка доступа.
 *
 * Тон задаётся снаружи, а вся анимация остаётся в CSS. Крутится только
 * кольцо; стеклянная сердцевина стоит на месте, поэтому индикатор
 * выглядит собранно и не превращается в обычный системный spinner.
 */
export function TetrinLoader({
  size = 30,
  tone = 'var(--accent-fill)',
  className = '',
  label,
}: {
  size?: number;
  tone?: string;
  className?: string;
  label?: string;
}) {
  return (
    <span
      className={`tetrin-loader ${className}`}
      style={
        {
          '--loader-size': `${size}px`,
          '--loader-tone': tone,
        } as CSSProperties
      }
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <span className="tetrin-loader-track" />
      <span className="tetrin-loader-ring" />
      <span className="tetrin-loader-core" />
    </span>
  );
}
