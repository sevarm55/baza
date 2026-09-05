import styles from './grain.module.css';

/**
 * Зерно на всю витрину. Ставится один раз на страницу.
 *
 * Разметки нет: один пустой слой поверх всего, устройство и причины —
 * в `grain.module.css`. Указателя не ловит и от читателя экрана скрыт.
 *
 * `inside` — тот же шум внутри окна входа. Окно рисуется в верхнем слое
 * браузера, выше общего зерна, и без своего слоя его панель оказалась
 * бы единственным гладким местом на витрине.
 */
export function Grain({ inside = false }: { inside?: boolean }) {
  return <div aria-hidden className={inside ? `${styles.grain} ${styles.inside}` : styles.grain} />;
}
