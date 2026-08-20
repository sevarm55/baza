/** Малое круговое кольцо для кнопок и компактных действий. */
export function TetrinMiniLoader({ className = '' }: { className?: string }) {
  return <span className={`tetrin-mini ${className}`} aria-hidden />;
}
