import { cn } from '@/lib/utils';
import styles from './hero-background.module.css';

/**
 * Фон первого экрана. Только свет и ничего больше.
 *
 * Ставится первым ребёнком в секцию с `relative` и `overflow-hidden`,
 * сам себя растягивает на неё целиком и не ловит указатель. Содержимое
 * экрана кладут рядом с `relative z-10`, иначе оно уйдёт под свет.
 *
 *     <section className="relative isolate min-h-svh overflow-hidden">
 *       <HeroBackground />
 *       <div className="relative z-10">…</div>
 *     </section>
 *
 * Разметки в компоненте нет: он собран из трёх пустых слоёв — свет,
 * левая шторка и края кадра, — а всё их устройство описано и объяснено
 * в `hero-background.module.css`. Правят там, здесь править нечего.
 *
 * Зерно сюда не входит: оно общее на всю витрину
 * (`components/landing/grain.tsx`).
 *
 * Теме не подчиняется. Первый экран тёмный при любой настройке: это
 * кадр рекламной съёмки, а не поверхность продукта.
 */
export function HeroBackground({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn(styles.bg, className)}>
      <div className={styles.glow} />
      <div className={styles.shield} />
      <div className={styles.vignette} />
    </div>
  );
}
